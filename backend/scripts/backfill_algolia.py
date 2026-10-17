#!/usr/bin/env python3
"""Idempotent backfill of the Algolia places index from DynamoDB Places_Places.

Reuses the same Places_AlgoliaSync mapping and skip/delete rules in
places_common.records (algolia_object_from_place / should_delete_from_algolia).

A DynamoDB stream starting at LATEST can miss writes around mapping enablement.
This script scans the table and upserts/deletes so the index matches DynamoDB.

Usage (from backend/):

    python scripts/backfill_algolia.py --dry-run
    python scripts/backfill_algolia.py
    python scripts/backfill_algolia.py --limit 50
    python scripts/backfill_algolia.py --prune

Environment (values from env only — never hardcode secrets):

    TABLE_PLACES              default Places_Places
    AWS_REGION                default us-east-1
    ALGOLIA_APP_ID            required unless --dry-run
    ALGOLIA_WRITE_API_KEY     required unless --dry-run
    ALGOLIA_INDEX_NAME        default places_dev

IAM: dynamodb:Scan on Places_Places. AWS credentials use the standard boto3 chain.
Algolia uses algoliasearch>=3,<4 (same client as Places_AlgoliaSync).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "lambda_layers" / "places_common" / "python"),
)

from places_common.records import (  # noqa: E402
    algolia_object_from_place,
    should_delete_from_algolia,
    to_jsonable,
)

UPSERT_BATCH_SIZE = 500
DEFAULT_TABLE = "Places_Places"
DEFAULT_REGION = "us-east-1"
DEFAULT_INDEX = "places_dev"
DRY_RUN_SAMPLES = 3


def _table_name() -> str:
    return os.environ.get("TABLE_PLACES") or DEFAULT_TABLE


def _region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or DEFAULT_REGION


def _get_table(table_name: str | None = None, region: str | None = None):
    import boto3

    return boto3.resource("dynamodb", region_name=region or _region()).Table(
        table_name or _table_name()
    )


def _get_index():
    """Same credential + client setup as Places_AlgoliaSync._get_index."""
    app_id = os.environ.get("ALGOLIA_APP_ID") or ""
    api_key = os.environ.get("ALGOLIA_WRITE_API_KEY") or ""
    index_name = os.environ.get("ALGOLIA_INDEX_NAME") or DEFAULT_INDEX
    if not app_id or not api_key:
        raise RuntimeError("Algolia write is not configured")
    from algoliasearch.search_client import SearchClient

    return SearchClient.create(app_id, api_key).init_index(index_name)


def classify_item(item: dict | None) -> tuple[str, dict[str, Any]]:
    """Apply Places_AlgoliaSync INSERT/MODIFY rules to a live DynamoDB item.

    Returns (action, details) where action is index | delete | skip.
    Rejected/hidden items are deleted (same as AlgoliaSync), not skipped.
    """
    if not item:
        return "skip", {"reason": "empty_item", "place_id": None, "object": None}

    place = to_jsonable(item)
    raw_id = place.get("place_id")
    if raw_id is None or raw_id == "":
        return "skip", {"reason": "missing_place_id", "place_id": None, "object": None}

    place_id = str(raw_id)
    if should_delete_from_algolia(place):
        status = place.get("internal_status")
        visibility = place.get("visibility") or "public"
        if status == "rejected":
            reason = "rejected"
        elif visibility == "hidden":
            reason = "hidden"
        else:
            reason = "not_indexable"
        return "delete", {"reason": reason, "place_id": place_id, "object": None}

    return "index", {
        "reason": None,
        "place_id": place_id,
        "object": algolia_object_from_place(place),
    }


def iter_table_scan(table, *, limit: int | None = None, page_size: int | None = None) -> Iterator[dict]:
    """Paginated Scan using LastEvaluatedKey. Optional page_size forces small pages."""
    kwargs: dict[str, Any] = {}
    if page_size is not None:
        kwargs["Limit"] = page_size

    yielded = 0
    while True:
        resp = table.scan(**kwargs)
        for item in resp.get("Items") or []:
            yield item
            yielded += 1
            if limit is not None and yielded >= limit:
                return
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            return
        kwargs["ExclusiveStartKey"] = last_key


def iter_index_object_ids(index) -> Iterator[str]:
    try:
        hits = index.browse_objects({"attributesToRetrieve": ["objectID"]})
    except TypeError:
        hits = index.browse_objects()
    for obj in hits:
        if isinstance(obj, dict) and obj.get("objectID"):
            yield str(obj["objectID"])


def _flush_objects(index, batch: list[dict], summary: dict, *, dry_run: bool) -> None:
    if not batch:
        return
    count = len(batch)
    if dry_run:
        summary["indexed"] += count
        batch.clear()
        return
    try:
        index.save_objects(list(batch))
        summary["indexed"] += count
    except Exception as exc:
        summary["errors"] += count
        summary["error_details"].append(
            {"op": "save_objects", "count": count, "error": str(exc)}
        )
    batch.clear()


def _flush_deletes(index, batch: list[str], summary: dict, *, dry_run: bool, field: str) -> None:
    if not batch:
        return
    count = len(batch)
    if dry_run:
        summary[field] += count
        batch.clear()
        return
    try:
        index.delete_objects(list(batch))
        summary[field] += count
    except Exception as exc:
        summary["errors"] += count
        summary["error_details"].append(
            {"op": "delete_objects", "count": count, "error": str(exc)}
        )
    batch.clear()


def run_backfill(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    prune: bool = False,
    table_name: str | None = None,
    region: str | None = None,
    scan_page_size: int | None = None,
    index=None,
    table=None,
    upsert_batch_size: int = UPSERT_BATCH_SIZE,
) -> dict[str, Any]:
    """Scan Places_Places and upsert/delete Algolia objects.

    Idempotent: save_objects overwrites by objectID; deletes of missing IDs are ignored.
    --dry-run never writes and never opens an Algolia client (no credentials needed).
    """
    skipped_reasons: Counter[str] = Counter()
    deleted_reasons: Counter[str] = Counter()
    summary: dict[str, Any] = {
        "dry_run": dry_run,
        "prune": prune,
        "table": table_name or _table_name(),
        "region": region or _region(),
        "index": os.environ.get("ALGOLIA_INDEX_NAME") or DEFAULT_INDEX,
        "scanned": 0,
        "indexed": 0,
        "skipped": 0,
        "skipped_reasons": {},
        "deleted": 0,
        "deleted_reasons": {},
        "pruned": 0,
        "errors": 0,
        "error_details": [],
        "scan_pages": 0,
        "samples": [],
    }

    table = table or _get_table(table_name, region)
    if not dry_run and index is None:
        index = _get_index()

    class _ScanCounter:
        def __init__(self, inner):
            self.inner = inner
            self.pages = 0

        def scan(self, **kwargs):
            self.pages += 1
            return self.inner.scan(**kwargs)

    counted = _ScanCounter(table)
    upsert_batch: list[dict] = []
    delete_batch: list[str] = []
    ddb_ids: set[str] = set()

    for item in iter_table_scan(counted, limit=limit, page_size=scan_page_size):
        summary["scanned"] += 1
        try:
            action, details = classify_item(item)
        except Exception as exc:
            summary["errors"] += 1
            summary["error_details"].append({"op": "classify", "error": str(exc)})
            continue

        place_id = details.get("place_id")
        if place_id:
            ddb_ids.add(place_id)

        if action == "skip":
            reason = details.get("reason") or "unknown"
            skipped_reasons[reason] += 1
            summary["skipped"] += 1
            if dry_run and len(summary["samples"]) < DRY_RUN_SAMPLES:
                summary["samples"].append({"action": "skip", "reason": reason})
        elif action == "delete":
            reason = details.get("reason") or "not_indexable"
            deleted_reasons[reason] += 1
            delete_batch.append(place_id)
            if dry_run and len(summary["samples"]) < DRY_RUN_SAMPLES:
                summary["samples"].append(
                    {"action": "delete", "reason": reason, "place_id": place_id}
                )
            if not dry_run and len(delete_batch) >= upsert_batch_size:
                _flush_deletes(index, delete_batch, summary, dry_run=False, field="deleted")
        elif action == "index":
            obj = details["object"]
            upsert_batch.append(obj)
            if dry_run and len(summary["samples"]) < DRY_RUN_SAMPLES:
                summary["samples"].append({"action": "index", "object": obj})
            if not dry_run and len(upsert_batch) >= upsert_batch_size:
                _flush_objects(index, upsert_batch, summary, dry_run=False)

    summary["scan_pages"] = counted.pages

    if dry_run:
        summary["indexed"] += len(upsert_batch)
        summary["deleted"] += len(delete_batch)
        upsert_batch.clear()
        delete_batch.clear()
    else:
        _flush_objects(index, upsert_batch, summary, dry_run=False)
        _flush_deletes(index, delete_batch, summary, dry_run=False, field="deleted")

    if prune and not dry_run:
        prune_batch: list[str] = []
        try:
            for object_id in iter_index_object_ids(index):
                if object_id not in ddb_ids:
                    prune_batch.append(object_id)
                    if len(prune_batch) >= upsert_batch_size:
                        _flush_deletes(index, prune_batch, summary, dry_run=False, field="pruned")
            _flush_deletes(index, prune_batch, summary, dry_run=False, field="pruned")
        except Exception as exc:
            summary["errors"] += 1
            summary["error_details"].append({"op": "prune", "error": str(exc)})
    elif prune and dry_run:
        summary["prune_skipped"] = "dry_run"

    summary["skipped_reasons"] = dict(skipped_reasons)
    summary["deleted_reasons"] = dict(deleted_reasons)
    return summary


def format_summary(summary: dict[str, Any]) -> str:
    return json.dumps(summary, indent=2, default=str)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Backfill the Algolia places index from DynamoDB Places_Places"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and map only: print counts and samples, no Algolia writes or credentials",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max DynamoDB items to process")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Delete Algolia objects whose objectID is not in the scanned DynamoDB items",
    )
    args = parser.parse_args(argv)

    index = None
    if not args.dry_run:
        try:
            index = _get_index()
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            print(
                "Set ALGOLIA_APP_ID and ALGOLIA_WRITE_API_KEY, or pass --dry-run",
                file=sys.stderr,
            )
            return 1

    try:
        summary = run_backfill(
            dry_run=args.dry_run, limit=args.limit, prune=args.prune, index=index
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    print(format_summary(summary))
    return 1 if summary.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
