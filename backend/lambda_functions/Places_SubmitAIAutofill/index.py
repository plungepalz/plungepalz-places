"""
PlungePalz Places API — Places_SubmitAIAutofill Lambda

Runs AI autofill on a verified submission using the generate_place_with_ai layer,
writes Places_Places, and updates Places_Submissions.
"""

import json
import os

import boto3
from decimal import Decimal

# Layer: generate_place_with_ai
from generate_place_with_ai import generate_place_record

TABLE_SUBMISSIONS = os.environ.get("TABLE_SUBMISSIONS", "Places_Submissions")
TABLE_PLACES = os.environ.get("TABLE_PLACES", "Places_Places")
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "")
ANTHROPIC_MODEL_ID = os.environ.get("ANTHROPIC_MODEL_ID", "claude-3-5-haiku-latest")

dynamodb = boto3.resource("dynamodb")
headers = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}


def _decimal_default(obj):
    """JSON serializer for Decimal."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def handler(event, context):
    try:
        body = event.get("body")
        if isinstance(body, str):
            body = json.loads(body) if body else {}
        else:
            body = body or {}
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    submission_id = body.get("submission_id") or (body.get("submissionId"))
    if not submission_id:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Missing submission_id"}),
        }

    table_sub = dynamodb.Table(TABLE_SUBMISSIONS)
    table_places = dynamodb.Table(TABLE_PLACES)

    try:
        resp = table_sub.get_item(Key={"submission_id": submission_id})
    except Exception:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Failed to load submission"}),
        }

    submission = resp.get("Item")
    if not submission:
        return {
            "statusCode": 404,
            "headers": headers,
            "body": json.dumps({"error": "Submission not found"}),
        }

    if not submission.get("verified"):
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Submission not verified. Verify email and phone first."}),
        }

    if submission.get("place_id_generated"):
        return {
            "statusCode": 409,
            "headers": headers,
            "body": json.dumps({"error": "Place already generated for this submission (idempotency)"}),
        }

    original = submission.get("original_submission_record_json") or {}
    place_name = original.get("place_name") or ""
    place_type = original.get("place_type") or "business"
    activity_types = original.get("activity_types") or ["cold_plunge"]
    address = original.get("address") or ""
    lat = original.get("lat") or original.get("latitude")
    lng = original.get("lng") or original.get("longitude")

    if place_type == "nature" and lat is not None and lng is not None:
        place_location = {"type": "coordinates", "value": f"{lng}|{lat}"}
    else:
        if not address:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Address required for non-nature places"}),
            }
        place_location = {"type": "address", "value": address}

    if not place_name:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "place_name is required"}),
        }

    if not GOOGLE_PLACES_API_KEY:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "GOOGLE_PLACES_API_KEY not configured"}),
        }

    if not ANTHROPIC_API_KEY:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY not configured"}),
        }

    result = generate_place_record(
        place_name=place_name,
        place_type=place_type,
        place_location=place_location,
        activity_types=activity_types,
        google_places_api_key=GOOGLE_PLACES_API_KEY,
        anthropic_api_key=ANTHROPIC_API_KEY,
        model_id=ANTHROPIC_MODEL_ID,
        submission_id=submission_id,
    )

    if not result.get("success"):
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "AI autofill failed", "errors": result.get("errors", [])}),
        }

    record = result.get("record")
    if not record:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "No record generated", "errors": result.get("errors", [])}),
        }

    place_id = record["place_id"]
    place_slug = record["place_slug"]

    # Convert record for DynamoDB (ensure Decimal for numbers)
    def _to_dynamo(obj):
        if isinstance(obj, dict):
            return {k: _to_dynamo(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_to_dynamo(v) for v in obj]
        if isinstance(obj, float):
            return Decimal(str(obj))
        return obj

    db_record = _to_dynamo(record)

    try:
        table_places.put_item(Item=db_record)
    except Exception:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Failed to write place"}),
        }

    ai_result = {
        "place_id": place_id,
        "description": record.get("description", ""),
        "place_type_metadata": record.get("place_type_metadata", {}),
        "amenities": record.get("amenities", []),
        "tags": record.get("tags", []),
        "external_ratings_ai_generated": record.get("external_ratings_ai_generated", {}),
        "google_places_api_data": record.get("google_places_api_data", {}),
        "ai_errors": result.get("errors", []),
        "generated_ts": record.get("ts_created", ""),
    }

    try:
        table_sub.update_item(
            Key={"submission_id": submission_id},
            UpdateExpression="SET ai_autofill_result = :air, place_id_generated = :pid, ts_last_updated = :ts",
            ExpressionAttributeValues={
                ":air": ai_result,
                ":pid": place_id,
                ":ts": record.get("ts_created", ""),
            },
        )
    except Exception:
        pass  # Place already written; update is best-effort

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps(
            {"place_id": place_id, "place_slug": place_slug, "ai_autofill_result": ai_result},
            default=_decimal_default,
        ),
    }
