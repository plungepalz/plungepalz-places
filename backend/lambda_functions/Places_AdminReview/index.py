"""
PlungePalz Places API — Places_AdminReview

POST /plungepalz_admin/review — IAM-auth (enforced by API Gateway).
Sets internal_status to active|rejected and optional internal_comments.
"""

import os

import boto3
from botocore.exceptions import ClientError

from places_common import (
    ValidationError,
    error_response,
    parse_json_body,
    success_response,
    utc_now,
)
from places_common.validate import validate_review_body

TABLE_PLACES = os.environ.get("TABLE_PLACES", "Places_Places")


def _table():
    return boto3.resource("dynamodb").Table(TABLE_PLACES)


def handler(event, context):
    try:
        body = parse_json_body(event)
        data = validate_review_body(body)
    except ValidationError as exc:
        return error_response(400, exc.code, exc.message, exc.details)

    ts = utc_now()
    expr = "SET internal_status = :st, ts_last_updated = :ts"
    values = {":st": data["decision"], ":ts": ts}
    if data.get("internal_comments") is not None:
        expr += ", internal_comments = :c"
        values[":c"] = data["internal_comments"]

    try:
        resp = _table().update_item(
            Key={"place_id": data["place_id"]},
            UpdateExpression=expr,
            ConditionExpression="attribute_exists(place_id)",
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return error_response(404, "NOT_FOUND", "Place not found")
        return error_response(500, "INTERNAL_ERROR", "Failed to update place")
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to update place")

    item = resp.get("Attributes") or {}
    return success_response(
        200,
        {
            "place_id": data["place_id"],
            "internal_status": item.get("internal_status") or data["decision"],
            "is_approved": (item.get("internal_status") or data["decision"]) == "active",
            "message": "Review complete",
        },
    )
