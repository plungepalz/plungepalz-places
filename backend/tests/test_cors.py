"""CORS headers on success AND error responses."""

from __future__ import annotations

from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body


def _assert_cors(resp, origin="*"):
    headers = resp["headers"]
    assert headers["Access-Control-Allow-Origin"] == origin
    assert headers["Content-Type"] == "application/json"


def test_cors_on_search_success_and_error(fake_algolia, monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "*")
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = load_handler("Places_Search")
    monkeypatch.setattr(mod, "_get_index", lambda: fake_algolia)

    ok = mod.handler(api_event(query={}), None)
    assert ok["statusCode"] == 200
    _assert_cors(ok)

    bad = mod.handler(api_event(query={"limit": "999"}), None)
    assert bad["statusCode"] == 400
    _assert_cors(bad)
    assert parse_body(bad)["error"]["code"] == "VALIDATION_ERROR"


def test_cors_custom_origin_on_getbyid_error(monkeypatch, dynamodb_tables):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://plungepalz.com")
    # Reload after env change so cors_headers reads the origin
    import places_common.http as http

    mod = load_handler("Places_GetByID")
    resp = mod.handler(api_event(path_parameters={"place_id": "missing"}), None)
    assert resp["statusCode"] == 404
    assert resp["headers"]["Access-Control-Allow-Origin"] == "https://plungepalz.com"
    assert http.cors_headers()["Access-Control-Allow-Origin"] == "https://plungepalz.com"


def test_cors_on_submit_error(dynamodb_tables):
    mod = load_handler("Places_Submit")
    resp = mod.handler(api_event(body={"place_name": ""}), None)
    assert resp["statusCode"] == 400
    _assert_cors(resp)


def test_cors_on_submit_success(dynamodb_tables):
    mod = load_handler("Places_Submit")
    resp = mod.handler(
        api_event(
            body={
                "place_name": "Lake",
                "place_type": "nature",
                "activity_types": ["cold_plunge"],
                "lat": 40.0,
                "lng": -111.0,
            }
        ),
        None,
    )
    assert resp["statusCode"] == 201
    _assert_cors(resp)


def test_cors_on_admin_review_error(dynamodb_tables):
    dynamodb_tables.Table("Places_Places").put_item(Item=dict(SAMPLE_PLACE))
    mod = load_handler("Places_AdminReview")
    resp = mod.handler(api_event(body={"place_id": SAMPLE_PLACE["place_id"]}), None)
    assert resp["statusCode"] == 400
    _assert_cors(resp)
