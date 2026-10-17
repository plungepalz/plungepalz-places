#!/usr/bin/env python3
"""Approve, reject, or revert a place by writing directly to DynamoDB with boto3.

This CLI does **not** call API Gateway / SigV4. It updates Places_Places the
same way Places_AdminReview does, so the DynamoDB stream can sync Algolia.

``--decision active`` flips ``is_approved`` to true (derived).
``--decision in_review`` restores the approval slice of a fresh POST /submit
(internal_status=in_review, is_approved false, internal_comments /
internal_verified_ts / reviewed_* / reviewer cleared).

IAM needed on the caller: dynamodb:GetItem, dynamodb:UpdateItem on TABLE_PLACES.

Usage (from backend/, with AWS credentials for us-east-1 / dev):

    python scripts/review_place.py --place-id UUID --decision active
    python scripts/review_place.py --place-id UUID --decision rejected --comments "duplicate"
    python scripts/review_place.py --place-id UUID --decision in_review
    python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision active
    python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision in_review

Environment:
    TABLE_PLACES          default Places_Places
    AWS_REGION            default us-east-1
    AWS_DEFAULT_REGION    fallback if AWS_REGION unset
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow running without installing the layer
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "lambda_layers" / "places_common" / "python"),
)


def utc_now() -> str:
    from places_common.records import utc_now as _utc_now

    return _utc_now()


def place_ids_from_output(payload: object) -> list[str]:
    """Extract place_ids from seed_places.py output or a bare list."""
    ids: list[str] = []

    def _add(value: object) -> None:
        if isinstance(value, str) and value.strip():
            ids.append(value.strip())
        elif isinstance(value, dict) and value.get("place_id"):
            ids.append(str(value["place_id"]).strip())

    if isinstance(payload, list):
        for item in payload:
            _add(item)
    elif isinstance(payload, dict):
        if isinstance(payload.get("place_ids"), list):
            for item in payload["place_ids"]:
                _add(item)
        elif isinstance(payload.get("created"), list):
            for item in payload["created"]:
                _add(item)
        elif payload.get("place_id"):
            _add(payload)
    # Preserve order, drop empties/dupes
    seen: set[str] = set()
    out: list[str] = []
    for place_id in ids:
        if place_id and place_id not in seen:
            seen.add(place_id)
            out.append(place_id)
    return out


def load_place_ids_from_file(path: Path) -> list[str]:
    return place_ids_from_output(json.loads(path.read_text(encoding="utf-8")))


def review_one(table, place_id: str, decision: str, comments: str | None) -> dict:
    from botocore.exceptions import ClientError
    from places_common.records import review_item_update_kwargs

    try:
        resp = table.update_item(
            **review_item_update_kwargs(place_id, decision, comments=comments, ts=utc_now())
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return {"error": {"code": "NOT_FOUND", "message": "Place not found"}, "place_id": place_id}
        return {"error": {"code": "INTERNAL_ERROR", "message": str(exc)}, "place_id": place_id}

    item = resp.get("Attributes") or {}
    status = item.get("internal_status")
    return {
        "place_id": place_id,
        "internal_status": status,
        "is_approved": status == "active",
        "ts_last_updated": item.get("ts_last_updated"),
    }


def validate_review_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.limit is not None and args.from_file is None:
        parser.error("--limit requires --from-file")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be >= 1")
    if bool(args.place_id) == bool(args.from_file):
        parser.error("provide exactly one of --place-id or --from-file")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Approve, reject, or revert a PlungePalz place to in_review"
    )
    parser.add_argument("--place-id", default=None, help="Places_Places.place_id")
    parser.add_argument(
        "--from-file",
        default=None,
        help="JSON from seed_places.py --output; review the first N ids with --limit",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="When using --from-file, review at most N place_ids (first N in file order; must be >= 1)",
    )
    parser.add_argument(
        "--decision",
        required=True,
        choices=["active", "rejected", "in_review"],
        help="internal_status to set; in_review reverts to a fresh submission",
    )
    parser.add_argument("--comments", default=None, help="optional internal_comments")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    validate_review_args(parser, args)

    if args.from_file:
        place_ids = load_place_ids_from_file(Path(args.from_file))
        if args.limit is not None:
            place_ids = place_ids[: args.limit]
        if not place_ids:
            print(json.dumps({"error": {"code": "VALIDATION_ERROR", "message": "No place_ids in file"}}))
            return 1
    else:
        place_ids = [args.place_id]

    table_name = os.environ.get("TABLE_PLACES", "Places_Places")
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"

    import boto3

    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    results = [review_one(table, place_id, args.decision, args.comments) for place_id in place_ids]
    if len(results) == 1:
        print(json.dumps(results[0]))
        return 1 if results[0].get("error") else 0
    print(json.dumps({"reviewed": results, "count": len(results)}))
    return 1 if any(item.get("error") for item in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
