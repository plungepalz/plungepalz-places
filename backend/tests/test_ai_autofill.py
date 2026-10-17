"""Places_SubmitAIAutofill: no verified gate, UpdateItem-only, idempotency."""

from __future__ import annotations

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


def test_ai_autofill_idempotent_409(dynamodb_tables, monkeypatch):
    place = _seed(dynamodb_tables)
    place["ai_autofill_ts"] = "2026-01-01T00:00:00Z"
    dynamodb_tables.Table("Places_Places").put_item(Item=place)
    mod = load_handler("Places_SubmitAIAutofill")
    mocked = MagicMock()
    monkeypatch.setattr(mod, "generate_place_record", mocked)
    resp = mod.handler(api_event(body={"submission_id": "sub-ai-1"}), None)
    assert resp["statusCode"] == 409
    mocked.assert_not_called()
