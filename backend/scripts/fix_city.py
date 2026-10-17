#!/usr/bin/env python3
"""Rewrite city (and optional state_province / postal_code) on Places_Places.

UNRUN: shipped for operators. Tests mock boto3. Do not run against deployed
data from CI or this PR. Never changes internal_status, place_slug, or any
attribute other than city / state_province / postal_code.

Each JSON object: {place_id, old_city, new_city, new_state_province?, new_postal_code?}

Usage (from backend/, with AWS credentials for us-east-1 / dev):

    python scripts/fix_city.py --from-file path/to/city_fixes.json --dry-run
    python scripts/fix_city.py --from-file path/to/city_fixes.json --limit 10
    python scripts/fix_city.py --from-file path/to/city_fixes.json --table Places_Places

IAM needed on the caller: dynamodb:GetItem, dynamodb:UpdateItem on TABLE_PLACES.

Credentials use the standard boto3 env / shared-config / instance-role chain only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

DEFAULT_TABLE = "Places_Places"
DEFAULT_REGION = "us-east-1"


def parse_positive_limit(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("--limit must be >= 1")
    return parsed


def load_fixes(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = raw.get("fixes") or raw.get("places") or raw.get("items")
        if not isinstance(items, list):
            raise ValueError("JSON object must contain a fixes/places/items array")
    else:
        raise ValueError("JSON must be a list of fix objects or an object with a list")

    cleaned: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"fix entry {index} must be an object")
        place_id = item.get("place_id")
        old_city = item.get("old_city")
        new_city = item.get("new_city")
        if not isinstance(place_id, str) or not place_id.strip():
            raise ValueError(f"fix entry {index} needs a non-empty place_id")
        if not isinstance(old_city, str) or not old_city.strip():
            raise ValueError(f"fix entry {index} needs a non-empty old_city")
        if not isinstance(new_city, str) or not new_city.strip():
            raise ValueError(f"fix entry {index} needs a non-empty new_city")
        row: dict[str, Any] = {
            "place_id": place_id.strip(),
            "old_city": old_city.strip(),
            "new_city": new_city.strip(),
        }
        for field, dest in (
            ("new_state_province", "new_state_province"),
            ("new_postal_code", "new_postal_code"),
        ):
            value = item.get(field)
            if isinstance(value, str) and value.strip():
                row[dest] = value.strip()
        cleaned.append(row)
    return cleaned


def city_update_kwargs(row: dict[str, Any]) -> dict[str, Any]:
    """UpdateItem kwargs: SET city (+ optional state/postal). Nothing else."""
    set_parts = ["city = :new"]
    values: dict[str, Any] = {":new": row["new_city"], ":old": row["old_city"]}
    if row.get("new_state_province"):
        set_parts.append("state_province = :sp")
        values[":sp"] = row["new_state_province"]
    if row.get("new_postal_code"):
        set_parts.append("postal_code = :pc")
        values[":pc"] = row["new_postal_code"]
    return {
        "Key": {"place_id": row["place_id"]},
        "UpdateExpression": "SET " + ", ".join(set_parts),
        "ConditionExpression": "attribute_exists(place_id) AND city = :old",
        "ExpressionAttributeValues": values,
        "ReturnValues": "ALL_NEW",
    }


def classify_dry_run(item: dict[str, Any] | None, row: dict[str, Any]) -> str:
    if not item:
        return "mismatch"
    current = item.get("city")
    if current == row["new_city"]:
        return "already_fixed"
    if current == row["old_city"]:
        return "would_update"
    return "mismatch"


def _table(table_name: str, region: str):
    import boto3

    return boto3.resource("dynamodb", region_name=region).Table(table_name)


def dry_run_one(table, row: dict[str, Any]) -> dict[str, Any]:
    resp = table.get_item(Key={"place_id": row["place_id"]}, ConsistentRead=True)
    item = resp.get("Item")
    status = classify_dry_run(item if isinstance(item, dict) else None, row)
    return {"place_id": row["place_id"], "status": status}


def update_one(table, row: dict[str, Any]) -> dict[str, Any]:
    from botocore.exceptions import ClientError

    try:
        table.update_item(**city_update_kwargs(row))
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return {"place_id": row["place_id"], "status": "skipped_mismatch"}
        return {
            "place_id": row["place_id"],
            "status": "error",
            "error": str(exc),
        }
    except Exception as exc:
        return {"place_id": row["place_id"], "status": "error", "error": str(exc)}
    return {"place_id": row["place_id"], "status": "updated"}


def run(args: argparse.Namespace, table=None) -> int:
    rows = load_fixes(Path(args.from_file))
    if args.limit is not None:
        rows = rows[: args.limit]

    table_name = args.table or os.environ.get("TABLE_PLACES") or DEFAULT_TABLE
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or DEFAULT_REGION
    if table is None:
        table = _table(table_name, region)

    dry_run = bool(args.dry_run)
    results: list[dict[str, Any]] = []
    for row in rows:
        if dry_run:
            results.append(dry_run_one(table, row))
        else:
            results.append(update_one(table, row))

    counts: dict[str, int] = {}
    for result in results:
        status = result.get("status") or "error"
        counts[status] = counts.get(status, 0) + 1

    summary = {
        "dry_run": dry_run,
        "table": table_name,
        "processed": len(results),
        "would_update": counts.get("would_update", 0),
        "already_fixed": counts.get("already_fixed", 0),
        "mismatch": counts.get("mismatch", 0),
        "updated": counts.get("updated", 0),
        "skipped_mismatch": counts.get("skipped_mismatch", 0),
        "errors": counts.get("error", 0),
        "results": results,
    }
    print(json.dumps(summary, indent=2))
    if counts.get("error"):
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "UNRUN: rewrite Places_Places.city (optional state_province/postal_code). "
            "Never updates internal_status or place_slug."
        )
    )
    parser.add_argument(
        "--from-file",
        required=True,
        help="JSON list of {place_id, old_city, new_city, ...} objects",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="ConsistentRead GetItem only; report would_update/already_fixed/mismatch",
    )
    parser.add_argument(
        "--limit",
        type=parse_positive_limit,
        default=None,
        help="Process at most N entries (must be >= 1)",
    )
    parser.add_argument(
        "--table",
        default=None,
        help=f"Places table name (default {DEFAULT_TABLE} or TABLE_PLACES)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
