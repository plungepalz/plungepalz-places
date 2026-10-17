"""Places_GetByID 200 / 404 cases — allowlisted flat payload."""

from __future__ import annotations

from places_common.constants import PLACE_DETAIL_FIELDS
from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body


def _put(dynamodb_tables, item):
    dynamodb_tables.Table("Places_Places").put_item(Item=item)


def test_get_by_id_200_public_in_review(dynamodb_tables):
    extra = dict(SAMPLE_PLACE)
    extra["h3_r7"] = "8729abc"
    extra["submission_id"] = "sub-secret"
    extra["internal_verified"] = False
    _put(dynamodb_tables, extra)
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": SAMPLE_PLACE["place_id"]}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert set(body.keys()) == set(PLACE_DETAIL_FIELDS)
    assert body["place_id"] == SAMPLE_PLACE["place_id"]
    assert body["is_approved"] is False
    assert body["ts_created"] == SAMPLE_PLACE["ts_created"]
    assert body["ts_last_updated"] == SAMPLE_PLACE["ts_last_updated"]
    assert "created_ts" not in body
    assert "internal_status" not in body
    assert "internal_comments" not in body
    assert "h3_r7" not in body
    assert "submission_id" not in body
    assert isinstance(body["lat"], float)
    assert isinstance(body["lng"], float)
    assert body["amenities"] == []
    assert body["tags"] == []
    assert body["place_type_metadata"] == {}
    assert body["external_ratings_ai_generated"] == {}
    assert body["hours_of_operation"] is None
    assert body["place_website_url"] is None


def test_get_by_id_hours_from_metadata(dynamodb_tables):
    item = dict(SAMPLE_PLACE)
    item["place_type_metadata"] = {
        "hours_of_operation": "Mon-Sat 6am-9pm",
        "access_type": "pay",
    }
    item["amenities"] = ["lockers"]
    item["tags"] = ["downtown"]
    item["place_website_url"] = "https://plungelab.com"
    _put(dynamodb_tables, item)
    mod = load_handler("Places_GetByID")
    body = parse_body(
        mod.handler(api_event(path_parameters={"place_id": item["place_id"]}), None)
    )
    assert body["hours_of_operation"] == "Mon-Sat 6am-9pm"
    assert body["amenities"] == ["lockers"]
    assert body["tags"] == ["downtown"]
    assert body["place_website_url"] == "https://plungelab.com"
    assert body["place_type_metadata"]["access_type"] == "pay"


def test_get_by_id_200_active_is_approved(dynamodb_tables):
    item = dict(SAMPLE_PLACE)
    item["internal_status"] = "active"
    _put(dynamodb_tables, item)
    mod = load_handler("Places_GetByID")
    body = parse_body(
        mod.handler(api_event(path_parameters={"place_id": item["place_id"]}), None)
    )
    assert body["is_approved"] is True


def test_get_by_id_404_missing(dynamodb_tables):
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": "nope"}), None)
    assert resp["statusCode"] == 404
    assert parse_body(resp)["error"]["code"] == "NOT_FOUND"


def test_get_by_id_404_rejected(dynamodb_tables):
    item = dict(SAMPLE_PLACE)
    item["internal_status"] = "rejected"
    _put(dynamodb_tables, item)
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": item["place_id"]}), None)
    assert resp["statusCode"] == 404


def test_get_by_id_404_hidden(dynamodb_tables):
    item = dict(SAMPLE_PLACE)
    item["visibility"] = "hidden"
    _put(dynamodb_tables, item)
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": item["place_id"]}), None)
    assert resp["statusCode"] == 404


def test_get_by_id_400_missing_path():
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={}), None)
    assert resp["statusCode"] == 400
