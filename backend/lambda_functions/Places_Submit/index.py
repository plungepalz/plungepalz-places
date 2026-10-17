"""
PlungePalz Places API — Places_Submit

POST /submit — MVP: no verification codes, no AI autofill.
Writes Places_Submissions AND Places_Places in one TransactWriteItems.
"""

import os

import boto3
from botocore.exceptions import ClientError

from places_common import (
    ValidationError,
    compute_h3,
    error_response,
    generate_place_slug,
    omit_empty_strings,
    parse_address_parts,
    parse_json_body,
    serialize_item,
    success_response,
    utc_now,
    validate_submit_body,
)
from places_common.records import new_place_id, new_submission_id

TABLE_PLACES = os.environ.get("TABLE_PLACES", "Places_Places")
TABLE_SUBMISSIONS = os.environ.get("TABLE_SUBMISSIONS", "Places_Submissions")


def _dynamodb():
    return boto3.resource("dynamodb")


def handler(event, context):
    try:
        body = parse_json_body(event)
        data = validate_submit_body(body)
    except ValidationError as exc:
        return error_response(400, exc.code, exc.message, exc.details)

    ts = utc_now()
    place_id = new_place_id()
    submission_id = new_submission_id()

    address_parts = parse_address_parts(data.get("address"))
    city = address_parts.get("city")
    place_slug = generate_place_slug(data["place_name"], city)

    original = omit_empty_strings(
        {
            "place_name": data["place_name"],
            "place_type": data["place_type"],
            "activity_types": data["activity_types"],
            "lat": data["lat"],
            "lng": data["lng"],
            "address": data.get("address"),
            "description": data.get("description"),
            "city": city,
            "state_province": address_parts.get("state_province"),
            "country": address_parts.get("country"),
        }
    )

    submission = omit_empty_strings(
        {
            "submission_id": submission_id,
            "submitted_ts": ts,
            "submitted_via": "web_app",
            "verified": False,
            "place_id_generated": place_id,
            "original_submission_record_json": original,
        }
    )
    if data.get("email"):
        submission["email_type"] = "email"
        submission["email_type_value"] = data["email"]

    place = {
        "place_id": place_id,
        "submission_id": submission_id,
        "lat": data["lat"],
        "lng": data["lng"],
        "place_name": data["place_name"],
        "place_type": data["place_type"],
        "visibility": "public",
        "place_slug": place_slug,
        "activity_types": data["activity_types"],
        "internal_status": "in_review",
        "internal_verified": False,
        "ts_created": ts,
        "ts_last_updated": ts,
        "cover_image": None,
        "header_image": None,
        "images": [],
        "amenities": [],
        "tags": [],
        "external_reporting": [],
        "total_plunge_sessions_recorded": 0,
        "total_sauna_sessions_recorded": 0,
        "has_plungepalz_discount": False,
        "use_google_places_api_data": False,
    }
    if data.get("address"):
        place["address"] = data["address"]
    if data.get("description"):
        place["description"] = data["description"]
    if city:
        place["city"] = city
    if address_parts.get("state_province"):
        place["state_province"] = address_parts["state_province"]
    if address_parts.get("country"):
        place["country"] = address_parts["country"]

    h3_fields = compute_h3(data["lat"], data["lng"])
    place.update(h3_fields)
    place = omit_empty_strings(place)

    client = _dynamodb().meta.client
    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": TABLE_SUBMISSIONS,
                        "Item": serialize_item(submission),
                        "ConditionExpression": "attribute_not_exists(submission_id)",
                    }
                },
                {
                    "Put": {
                        "TableName": TABLE_PLACES,
                        "Item": serialize_item(place),
                        "ConditionExpression": "attribute_not_exists(place_id)",
                    }
                },
            ]
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "TransactionCanceledException":
            return error_response(409, "CONFLICT", "Submission could not be created")
        return error_response(500, "INTERNAL_ERROR", "Failed to write submission")
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to write submission")

    return success_response(
        201,
        {
            "submission_id": submission_id,
            "place_id": place_id,
            "place_slug": place_slug,
            "is_approved": False,
        },
    )
