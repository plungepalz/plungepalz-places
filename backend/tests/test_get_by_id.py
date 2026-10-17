"""Places_GetByID 200 / 404 cases."""

from __future__ import annotations

from decimal import Decimal

from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body


def _put(dynamodb_tables, item):
    dynamodb_tables.Table("Places_Places").put_item(Item=item)


def test_get_by_id_200_public_in_review(dynamodb_tables):
    _put(dynamodb_tables, dict(SAMPLE_PLACE))
    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": SAMPLE_PLACE["place_id"]}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert body["place_id"] == SAMPLE_PLACE["place_id"]
    assert body["is_approved"] is False
    assert body["ts_created"] == SAMPLE_PLACE["ts_created"]
    assert "created_ts" not in body  # GetByID keeps schema names
    assert "internal_status" not in body
    assert "internal_comments" not in body
    assert isinstance(body["lat"], float)
    assert isinstance(body["lng"], float)


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
