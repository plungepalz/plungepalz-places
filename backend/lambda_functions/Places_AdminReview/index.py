"""
PlungePalz Places API — Places_AdminReview

POST /plungepalz_admin/review — IAM-auth (enforced by API Gateway).
Sets internal_status to active|rejected|in_review and optional internal_comments.
decision=in_review reverts approval metadata to a fresh Places_Submit record.
"""

import os

import boto3
from botocore.exceptions import ClientError

from places_common import (
    ValidationError,
    error_response,
    parse_json_body,
    review_item_update_kwargs,
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

    try:
        resp = _table().update_item(
            **review_item_update_kwargs(
                data["place_id"],
                data["decision"],
                comments=data.get("internal_comments"),
                ts=utc_now(),
            )
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return error_response(404, "NOT_FOUND", "Place not found")
        return error_response(500, "INTERNAL_ERROR", "Failed to update place")
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to update place")

    item = resp.get("Attributes") or {}
    status = item.get("internal_status") or data["decision"]
    return success_response(
        200,
        {
            "place_id": data["place_id"],
            "internal_status": status,
            "is_approved": status == "active",
            "message": "Review complete",
        },
    )
