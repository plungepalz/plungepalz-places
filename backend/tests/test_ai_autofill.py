"""Places_SubmitAIAutofill: no verified gate, UpdateItem-only, idempotency."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body


def _seed(dynamodb_tables, *, verified=False, description="User written copy"):
    place = dict(SAMPLE_PLACE)
    if description:
        place["description"] = description
    else:
        place.pop("description", None)
    place["place_id"] = "place-ai-1"
    place["submission_id"] = "sub-ai-1"
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    dynamodb_tables.Table("Places_Submissions").put_item(
        Item={
            "submission_id": "sub-ai-1",
            "verified": verified,
            "place_id_generated": "place-ai-1",
            "original_submission_record_json": {
                "place_name": place["place_name"],
                "place_type": place["place_type"],
                "activity_types": place["activity_types"],
                "address": place["address"],
                "lat": place["lat"],
                "lng": place["lng"],
                **({"description": description} if description else {}),
            },
        }
    )
    return place


def _ai_record():
    return {
        "success": True,
        "record": {
            "place_id": "should-not-be-used",
            "place_slug": "ignored",
            "description": "AI description",
            "place_type_metadata": {"access_type": "pay", "experience_type": "Community"},
            "amenities": ["towels"],
            "tags": ["studio"],
            "external_ratings_ai_generated": {"google": Decimal("4.7")},
            "google_places_api_data": {"id": "ChIJ"},
            "place_website_url": "https://plungelab.com",
        },
        "errors": [],
        "partial": False,
    }


def test_ai_autofill_default_model_is_current_haiku():
    mod = load_handler("Places_SubmitAIAutofill")
    assert mod.ANTHROPIC_MODEL == "claude-haiku-4-5-20251001"
    assert mod.ANTHROPIC_MAX_TOKENS == 1024


def test_ai_autofill_without_verified_updates_existing(dynamodb_tables, monkeypatch):
    _seed(dynamodb_tables, verified=False, description="Keep me")
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    monkeypatch.setattr(mod, "generate_place_record", MagicMock(return_value=_ai_record()))

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert body["place_id"] == "place-ai-1"

    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["description"] == "Keep me"  # user description preserved
    assert stored["amenities"] == ["towels"]
    assert stored["tags"] == ["studio"]
    assert stored["place_name"] == SAMPLE_PLACE["place_name"]
    assert stored.get("ai_autofill_ts")
    assert stored.get("ai_autofill_claimed_ts")


def test_ai_autofill_fills_empty_description(dynamodb_tables, monkeypatch):
    _seed(dynamodb_tables, description=None)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    monkeypatch.setattr(mod, "generate_place_record", MagicMock(return_value=_ai_record()))

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 200
    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["description"] == "AI description"


def test_ai_autofill_missing_place_404(dynamodb_tables, monkeypatch):
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    mocked = MagicMock()
    monkeypatch.setattr(mod, "generate_place_record", mocked)
    resp = mod.handler(api_event(body={"place_id": "missing-place"}), None)
    assert resp["statusCode"] == 404
    mocked.assert_not_called()


def test_ai_autofill_idempotent_409(dynamodb_tables, monkeypatch):
    place = _seed(dynamodb_tables)
    place["ai_autofill_ts"] = "2026-01-01T00:00:00Z"
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    mocked = MagicMock()
    monkeypatch.setattr(mod, "generate_place_record", mocked)
    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 409
    mocked.assert_not_called()


def test_ai_autofill_sets_complete_status(dynamodb_tables, monkeypatch):
    _seed(dynamodb_tables, description="Keep me")
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    monkeypatch.setattr(mod, "generate_place_record", MagicMock(return_value=_ai_record()))

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 200
    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["ai_autofill_status"] == "complete"
    assert stored.get("ai_autofill_ts")


def test_ai_autofill_second_claim_makes_no_outbound_calls(dynamodb_tables, monkeypatch):
    _seed(dynamodb_tables)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    mocked = MagicMock(return_value=_ai_record())
    monkeypatch.setattr(mod, "generate_place_record", mocked)

    first = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert first["statusCode"] == 200
    mocked.reset_mock()

    second = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert second["statusCode"] == 409
    mocked.assert_not_called()


def test_ai_autofill_pending_claim_makes_no_outbound_calls(dynamodb_tables, monkeypatch):
    place = _seed(dynamodb_tables)
    place["ai_autofill_status"] = "pending"
    place["ai_autofill_claimed_ts"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    mocked = MagicMock()
    monkeypatch.setattr(mod, "generate_place_record", mocked)

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 409
    mocked.assert_not_called()


def test_ai_autofill_failure_sets_failed_and_hides_provider_errors(
    dynamodb_tables, monkeypatch
):
    _seed(dynamodb_tables)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    leaked = "Google Places searchText error: 403 REQUEST_DENIED secret-key-xyz"
    monkeypatch.setattr(
        mod,
        "generate_place_record",
        MagicMock(return_value={"success": False, "record": None, "errors": [leaked]}),
    )

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 500
    body = parse_body(resp)
    dumped = resp["body"]
    assert leaked not in dumped
    assert "secret-key-xyz" not in dumped
    assert "REQUEST_DENIED" not in dumped
    assert body["error"]["message"] == "AI autofill failed"
    assert "details" not in body["error"] or leaked not in str(body["error"].get("details"))

    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["ai_autofill_status"] == "failed"
    assert "ai_autofill_ts" not in stored


def test_ai_autofill_stale_pending_can_reclaim(dynamodb_tables, monkeypatch):
    place = _seed(dynamodb_tables)
    place["ai_autofill_status"] = "pending"
    place["ai_autofill_claimed_ts"] = (
        datetime.now(timezone.utc) - timedelta(minutes=6)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    mocked = MagicMock(return_value=_ai_record())
    monkeypatch.setattr(mod, "generate_place_record", mocked)

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 200
    mocked.assert_called_once()
    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["ai_autofill_status"] == "complete"
    assert stored.get("ai_autofill_claimed_ts")


def test_ai_autofill_failed_can_retry(dynamodb_tables, monkeypatch):
    place = _seed(dynamodb_tables)
    place["ai_autofill_status"] = "failed"
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setenv("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "ak")
    mod = load_handler("Places_SubmitAIAutofill")
    monkeypatch.setattr(mod, "GOOGLE_PLACES_API_KEY", "gk")
    monkeypatch.setattr(mod, "ANTHROPIC_API_KEY", "ak")
    mocked = MagicMock(return_value=_ai_record())
    monkeypatch.setattr(mod, "generate_place_record", mocked)

    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 200
    mocked.assert_called_once()
    stored = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": "place-ai-1"})["Item"]
    assert stored["ai_autofill_status"] == "complete"
