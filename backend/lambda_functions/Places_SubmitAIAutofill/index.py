"""
PlungePalz Places API — Places_SubmitAIAutofill

Opt-in enrichment of an EXISTING place (created by Places_Submit).
Not on the submit path. No verification-code gate.

AWS_IAM only (admin-triggered). Not a public route.

Touches only AI-generated fields via UpdateItem:
  description (only if currently empty), place_type_metadata, amenities, tags,
  external_ratings_ai_generated, google_places_api_data.

Spend controls: cheap Haiku default, ANTHROPIC_MAX_TOKENS, and a conditional
claim on ai_autofill_status before any Google/Anthropic call
(ConditionalCheckFailed → 409).
"""

import logging
import os
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from generate_place_with_ai import generate_place_record
from places_common import (
    ValidationError,
    error_response,
    omit_empty_strings,
    parse_json_body,
    success_response,
    utc_now,
)
from places_common.constants import (
    AI_AUTOFILL_STATUS_COMPLETE,
    AI_AUTOFILL_STATUS_FAILED,
    AI_AUTOFILL_STATUS_PENDING,
)

logger = logging.getLogger(__name__)

TABLE_SUBMISSIONS = os.environ.get("TABLE_SUBMISSIONS", "Places_Submissions")
TABLE_PLACES = os.environ.get("TABLE_PLACES", "Places_Places")
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "")
# ANTHROPIC_MODEL is the contract name; ANTHROPIC_MODEL_ID is accepted as a fallback.
ANTHROPIC_MODEL = (
    os.environ.get("ANTHROPIC_MODEL")
    or os.environ.get("ANTHROPIC_MODEL_ID")
    or "claude-haiku-4-5-20251001"
)
try:
    ANTHROPIC_MAX_TOKENS = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "1024"))
except ValueError:
    ANTHROPIC_MAX_TOKENS = 1024
ANTHROPIC_MAX_TOKENS = max(1, min(ANTHROPIC_MAX_TOKENS, 2048))

# Keep the old name as an alias so tests/scripts that patch ANTHROPIC_MODEL_ID still work.
ANTHROPIC_MODEL_ID = ANTHROPIC_MODEL


def _dynamodb():
    return boto3.resource("dynamodb")


def _to_dynamo(obj):
    if isinstance(obj, dict):
        return {k: _to_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_dynamo(v) for v in obj]
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def _generic_autofill_error():
    return error_response(500, "INTERNAL_ERROR", "AI autofill failed")


def _claim_autofill(table_places, place_id: str):
    """Claim the job before any paid outbound call. failed can retry."""
    try:
        table_places.update_item(
            Key={"place_id": place_id},
            UpdateExpression="SET ai_autofill_status = :pending",
            ConditionExpression=(
                "(attribute_not_exists(ai_autofill_status) "
                "OR NOT ai_autofill_status IN (:pending, :complete)) "
                "AND attribute_not_exists(ai_autofill_ts)"
            ),
            ExpressionAttributeValues={
                ":pending": AI_AUTOFILL_STATUS_PENDING,
                ":complete": AI_AUTOFILL_STATUS_COMPLETE,
            },
        )
        return None
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return error_response(409, "CONFLICT", "Place already AI-enriched (idempotency)")
        logger.exception("Failed to claim AI autofill for place_id=%s", place_id)
        return error_response(500, "INTERNAL_ERROR", "Failed to claim AI autofill")
    except Exception:
        logger.exception("Failed to claim AI autofill for place_id=%s", place_id)
        return error_response(500, "INTERNAL_ERROR", "Failed to claim AI autofill")


def _set_autofill_status(table_places, place_id: str, status: str) -> None:
    try:
        table_places.update_item(
            Key={"place_id": place_id},
            UpdateExpression="SET ai_autofill_status = :status, ts_last_updated = :ts",
            ExpressionAttributeValues={":status": status, ":ts": utc_now()},
        )
    except Exception:
        logger.exception(
            "Failed to set ai_autofill_status=%s for place_id=%s", status, place_id
        )


def handler(event, context):
    try:
        body = parse_json_body(event)
    except ValidationError as exc:
        return error_response(400, exc.code, exc.message, exc.details)

    submission_id = body.get("submission_id") or body.get("submissionId")
    place_id = body.get("place_id") or body.get("placeId")
    if not submission_id and not place_id:
        return error_response(
            400,
            "VALIDATION_ERROR",
            "Invalid request body",
            {"submission_id": "submission_id or place_id is required"},
        )

    dynamodb = _dynamodb()
    table_sub = dynamodb.Table(TABLE_SUBMISSIONS)
    table_places = dynamodb.Table(TABLE_PLACES)

    submission = None
    if submission_id:
        try:
            resp = table_sub.get_item(Key={"submission_id": submission_id})
        except Exception:
            return error_response(500, "INTERNAL_ERROR", "Failed to load submission")
        submission = resp.get("Item")
        if not submission:
            return error_response(404, "NOT_FOUND", "Submission not found")
        place_id = place_id or submission.get("place_id_generated")
        if not place_id:
            return error_response(
                400,
                "VALIDATION_ERROR",
                "Submission has no place_id_generated",
                {"place_id": "Submit the place before requesting AI autofill"},
            )

    try:
        place_resp = table_places.get_item(Key={"place_id": place_id})
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to load place")

    place = place_resp.get("Item")
    if not place:
        return error_response(404, "NOT_FOUND", "Place not found")

    original = (submission or {}).get("original_submission_record_json") or {}
    place_name = place.get("place_name") or original.get("place_name") or ""
    place_type = place.get("place_type") or original.get("place_type") or "business"
    activity_types = place.get("activity_types") or original.get("activity_types") or ["cold_plunge"]
    address = place.get("address") or original.get("address") or ""
    lat = place.get("lat") if place.get("lat") is not None else original.get("lat")
    lng = place.get("lng") if place.get("lng") is not None else original.get("lng")

    if place_type == "nature" and lat is not None and lng is not None:
        place_location = {"type": "coordinates", "value": f"{lng}|{lat}"}
    elif address:
        place_location = {"type": "address", "value": address}
    elif lat is not None and lng is not None:
        place_location = {"type": "coordinates", "value": f"{lng}|{lat}"}
    else:
        return error_response(
            400,
            "VALIDATION_ERROR",
            "Invalid request body",
            {"address": "Address or coordinates required for AI autofill"},
        )

    if not place_name:
        return error_response(
            400,
            "VALIDATION_ERROR",
            "Invalid request body",
            {"place_name": "place_name is required"},
        )

    if not GOOGLE_PLACES_API_KEY:
        return error_response(500, "INTERNAL_ERROR", "GOOGLE_PLACES_API_KEY not configured")
    if not ANTHROPIC_API_KEY:
        return error_response(
            500,
            "INTERNAL_ERROR",
            "ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY not configured",
        )

    claimed = _claim_autofill(table_places, place_id)
    if claimed is not None:
        return claimed

    result = generate_place_record(
        place_name=place_name,
        place_type=place_type,
        place_location=place_location,
        activity_types=list(activity_types),
        google_places_api_key=GOOGLE_PLACES_API_KEY,
        anthropic_api_key=ANTHROPIC_API_KEY,
        model_id=ANTHROPIC_MODEL,
        submission_id=submission_id or place.get("submission_id") or "",
        max_tokens=ANTHROPIC_MAX_TOKENS,
    )

    if not result.get("success"):
        logger.error(
            "AI autofill provider error for place_id=%s: %s",
            place_id,
            "; ".join(result.get("errors") or ["unknown error"]),
        )
        _set_autofill_status(table_places, place_id, AI_AUTOFILL_STATUS_FAILED)
        return _generic_autofill_error()

    record = result.get("record") or {}
    ts = utc_now()

    expr_parts = [
        "place_type_metadata = :meta",
        "amenities = :amen",
        "tags = :tags",
        "external_ratings_ai_generated = :ratings",
        "google_places_api_data = :gp",
        "latest_google_places_refresh = :ts",
        "ai_autofill_ts = :ts",
        "ai_autofill_status = :complete",
        "ts_last_updated = :ts",
        "use_google_places_api_data = :use_gp",
    ]
    values = {
        ":meta": _to_dynamo(record.get("place_type_metadata") or {}),
        ":amen": _to_dynamo(record.get("amenities") or []),
        ":tags": _to_dynamo(record.get("tags") or []),
        ":ratings": _to_dynamo(record.get("external_ratings_ai_generated") or {}),
        ":gp": _to_dynamo(record.get("google_places_api_data") or {}),
        ":ts": ts,
        ":complete": AI_AUTOFILL_STATUS_COMPLETE,
        ":use_gp": bool(record.get("google_places_api_data")),
    }

    existing_description = (place.get("description") or "").strip()
    if not existing_description and record.get("description"):
        expr_parts.append("description = :desc")
        values[":desc"] = record["description"]

    if record.get("place_website_url") and not place.get("place_website_url"):
        expr_parts.append("place_website_url = :web")
        values[":web"] = record["place_website_url"]

    try:
        table_places.update_item(
            Key={"place_id": place_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ConditionExpression="attribute_not_exists(ai_autofill_ts)",
            ExpressionAttributeValues=values,
        )
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return error_response(409, "CONFLICT", "Place already AI-enriched (idempotency)")
        logger.exception("Failed to persist AI autofill for place_id=%s", place_id)
        _set_autofill_status(table_places, place_id, AI_AUTOFILL_STATUS_FAILED)
        return _generic_autofill_error()
    except Exception:
        logger.exception("Failed to persist AI autofill for place_id=%s", place_id)
        _set_autofill_status(table_places, place_id, AI_AUTOFILL_STATUS_FAILED)
        return _generic_autofill_error()

    if result.get("errors"):
        logger.warning(
            "AI autofill completed with non-fatal provider notes for place_id=%s: %s",
            place_id,
            "; ".join(result.get("errors") or []),
        )

    ai_result = omit_empty_strings(
        {
            "place_id": place_id,
            "description": record.get("description", "") if not existing_description else existing_description,
            "place_type_metadata": record.get("place_type_metadata", {}),
            "amenities": record.get("amenities", []),
            "tags": record.get("tags", []),
            "external_ratings_ai_generated": record.get("external_ratings_ai_generated", {}),
            "google_places_api_data": record.get("google_places_api_data", {}),
            "ai_errors": [],
            "generated_ts": ts,
        }
    )

    if submission_id:
        try:
            table_sub.update_item(
                Key={"submission_id": submission_id},
                UpdateExpression="SET ai_autofill_result = :air, place_id_generated = :pid",
                ExpressionAttributeValues={":air": _to_dynamo(ai_result), ":pid": place_id},
            )
        except Exception:
            pass

    return success_response(
        200,
        {
            "place_id": place_id,
            "place_slug": place.get("place_slug") or record.get("place_slug"),
            "ai_autofill_result": ai_result,
        },
    )
