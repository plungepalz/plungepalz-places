#!/usr/bin/env python3
"""Approve or reject a place by writing directly to DynamoDB with boto3.

This CLI does **not** call API Gateway / SigV4. It updates Places_Places the
same way Places_AdminReview does, so the DynamoDB stream can sync Algolia and
`is_approved` flips to true when decision=active.

IAM needed on the caller: dynamodb:GetItem, dynamodb:UpdateItem on TABLE_PLACES.

Usage (from backend/, with AWS credentials for us-east-1 / dev):

    python scripts/review_place.py --place-id UUID --decision active
    python scripts/review_place.py --place-id UUID --decision rejected --comments "duplicate"

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
from datetime import datetime, timezone
from pathlib import Path

# Allow running without installing the layer
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "lambda_layers" / "places_common" / "python"),
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    parser = argparse.ArgumentParser(description="Approve or reject a PlungePalz place")
    parser.add_argument("--place-id", required=True, help="Places_Places.place_id")
    parser.add_argument(
        "--decision",
        required=True,
        choices=["active", "rejected"],
        help="internal_status to set",
    )
    parser.add_argument("--comments", default=None, help="optional internal_comments")
    args = parser.parse_args()

    table_name = os.environ.get("TABLE_PLACES", "Places_Places")
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"

    import boto3
    from botocore.exceptions import ClientError

    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    ts = utc_now()
    expr = "SET internal_status = :st, ts_last_updated = :ts"
    values = {":st": args.decision, ":ts": ts}
    if args.comments:
        expr += ", internal_comments = :c"
        values[":c"] = args.comments

    try:
        resp = table.update_item(
            Key={"place_id": args.place_id},
            UpdateExpression=expr,
            ConditionExpression="attribute_exists(place_id)",
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            print(json.dumps({"error": {"code": "NOT_FOUND", "message": "Place not found"}}))
            return 1
        print(json.dumps({"error": {"code": "INTERNAL_ERROR", "message": str(exc)}}))
        return 1

    item = resp.get("Attributes") or {}
    print(
        json.dumps(
            {
                "place_id": args.place_id,
                "internal_status": item.get("internal_status"),
                "is_approved": item.get("internal_status") == "active",
                "ts_last_updated": item.get("ts_last_updated"),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
