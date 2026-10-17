"""
PlungePalz Places API — Places_GetByID

GET /place/{place_id} — DynamoDB lookup. 404 if missing, rejected, or hidden.
"""

import os

import boto3

from places_common import error_response, place_detail, success_response

TABLE_PLACES = os.environ.get("TABLE_PLACES", "Places_Places")


def _table():
    return boto3.resource("dynamodb").Table(TABLE_PLACES)


def handler(event, context):
    path_params = (event or {}).get("pathParameters") or {}
    place_id = path_params.get("place_id") or path_params.get("placeId")
    if not place_id:
        return error_response(
            400,
            "VALIDATION_ERROR",
            "Invalid request parameters",
            {"place_id": "place_id is required"},
        )

    try:
        resp = _table().get_item(Key={"place_id": place_id})
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to load place")

    item = resp.get("Item")
    if not item:
        return error_response(404, "NOT_FOUND", "Place not found")

    if item.get("internal_status") == "rejected" or item.get("visibility") == "hidden":
        return error_response(404, "NOT_FOUND", "Place not found")

    return success_response(200, place_detail(item))
