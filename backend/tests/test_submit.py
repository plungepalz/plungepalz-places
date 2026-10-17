"""Places_Submit validation, nature address optional, transactional write, 201 shape."""

from __future__ import annotations

from tests.conftest import api_event, load_handler, parse_body

VALID = {
    "place_name": "Plunge Lab",
    "place_type": "business",
    "activity_types": ["cold_plunge", "sauna"],
    "lat": 40.7608,
    "lng": -111.891,
    "address": "457 E 300 S, Salt Lake City, UT 84111",
    "description": "A studio.",
    "email": "owner@example.com",
}


def test_submit_201_and_transaction(dynamodb_tables):
    mod = load_handler("Places_Submit")
    resp = mod.handler(api_event(body=VALID), None)
    assert resp["statusCode"] == 201
    body = parse_body(resp)
    assert set(body) == {"submission_id", "place_id", "place_slug", "is_approved"}
    assert body["is_approved"] is False
    assert body["submission_id"].startswith("sub_")
    assert body["place_slug"].startswith("plunge-lab")
    compact_id = body["place_id"].replace("-", "").lower()
    assert body["place_slug"].endswith(compact_id[-8:])

    places = dynamodb_tables.Table("Places_Places")
    subs = dynamodb_tables.Table("Places_Submissions")
    place = places.get_item(Key={"place_id": body["place_id"]})["Item"]
    sub = subs.get_item(Key={"submission_id": body["submission_id"]})["Item"]

    assert place["internal_status"] == "in_review"
    assert place["visibility"] == "public"
    assert place["place_name"] == "Plunge Lab"
    assert sub["place_id_generated"] == body["place_id"]
    assert sub["verified"] is False
    assert "internal_comments" not in place or place.get("internal_comments") != ""
    # no empty strings
    for key, value in place.items():
        assert value != "", key
    for key, value in sub.items():
        assert value != "", key


def test_submit_h3_present_when_library_available(dynamodb_tables):
    import h3  # noqa: F401 — required via requirements-dev.txt

    mod = load_handler("Places_Submit")
    body = parse_body(mod.handler(api_event(body=VALID), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert "h3_r7" in place and place["h3_r7"]
    assert "h3_r5" in place and place["h3_r5"]
    assert "h3_r4" in place and place["h3_r4"]


def test_submit_h3_omitted_when_unavailable(dynamodb_tables, monkeypatch):
    mod = load_handler("Places_Submit")
    monkeypatch.setattr(mod, "compute_h3", lambda *a, **k: {})
    body = parse_body(mod.handler(api_event(body=VALID), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert "h3_r7" not in place
    assert "h3_r5" not in place
    assert "h3_r4" not in place


def test_submit_address_optional_for_nature(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        "place_name": "Silver Lake",
        "place_type": "nature",
        "activity_types": ["cold_plunge"],
        "lat": 40.5974,
        "lng": -111.5853,
    }
    resp = mod.handler(api_event(body=payload), None)
    assert resp["statusCode"] == 201
    place_id = parse_body(resp)["place_id"]
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": place_id})["Item"]
    assert "address" not in place


def test_submit_address_required_for_business(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = dict(VALID)
    payload.pop("address")
    resp = mod.handler(api_event(body=payload), None)
    assert resp["statusCode"] == 400
    assert "address" in parse_body(resp)["error"]["details"]


def test_submit_validation_errors(dynamodb_tables):
    mod = load_handler("Places_Submit")

    def details(payload):
        resp = mod.handler(api_event(body=payload), None)
        assert resp["statusCode"] == 400
        return parse_body(resp)["error"]["details"]

    assert "place_name" in details({**VALID, "place_name": ""})
    assert "place_type" in details({**VALID, "place_type": "cafe"})
    assert "activity_types" in details({**VALID, "activity_types": []})
    assert "activity_types" in details({**VALID, "activity_types": ["hot_tub"]})
    assert "lat" in details({**VALID, "lat": 100})
    assert "lng" in details({**VALID, "lng": -200})
    assert "lat" in details({k: v for k, v in VALID.items() if k != "lat"})
    assert "email" in details({**VALID, "email": "not-an-email"})
    assert "place_name" in details({**VALID, "place_name": "x" * 201})
    assert "address" in details({**VALID, "address": "x" * 501})
    assert "description" in details({**VALID, "description": "x" * 2001})


def test_submit_max_lengths_at_limit_ok(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        **VALID,
        "place_name": "x" * 200,
        "address": "x" * 500,
        "description": "x" * 2000,
    }
    resp = mod.handler(api_event(body=payload), None)
    assert resp["statusCode"] == 201


def test_submit_parses_international_city_and_postal_code(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        **VALID,
        "place_name": "Löyly",
        "address": "Hernesaarenranta 4, 00150 Helsinki, Finland",
    }
    body = parse_body(mod.handler(api_event(body=payload), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert place["city"] == "Helsinki"
    assert place["country"] == "Finland"
    assert place["postal_code"] == "00150"
    assert "00150" not in place["place_slug"]
    assert "helsinki" in place["place_slug"]
    sub = dynamodb_tables.Table("Places_Submissions").get_item(
        Key={"submission_id": body["submission_id"]}
    )["Item"]
    original = sub["original_submission_record_json"]
    assert original["city"] == "Helsinki"
    assert original["postal_code"] == "00150"


def test_submit_usa_country_from_usa_token(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        **VALID,
        "address": "457 East 300 South, Salt Lake City, UT 84111, USA",
    }
    body = parse_body(mod.handler(api_event(body=payload), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert place["country"] == "USA"
    assert place["city"] == "Salt Lake City"
    assert place["state_province"] == "UT"
    assert place["postal_code"] == "84111"


def test_submit_omits_postal_code_when_absent(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        "place_name": "Silver Lake",
        "place_type": "nature",
        "activity_types": ["cold_plunge"],
        "lat": 40.5974,
        "lng": -111.5853,
    }
    body = parse_body(mod.handler(api_event(body=payload), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert "postal_code" not in place
    assert "city" not in place


def test_submit_explicit_city_state_postal_win_over_parsed(dynamodb_tables):
    mod = load_handler("Places_Submit")
    payload = {
        **VALID,
        "city": "Explicit City",
        "state_province": "CO",
        "postal_code": "80202",
    }
    body = parse_body(mod.handler(api_event(body=payload), None))
    place = dynamodb_tables.Table("Places_Places").get_item(Key={"place_id": body["place_id"]})[
        "Item"
    ]
    assert place["city"] == "Explicit City"
    assert place["state_province"] == "CO"
    assert place["postal_code"] == "80202"
    assert "explicit-city" in body["place_slug"]


def test_submit_invalid_json():
    mod = load_handler("Places_Submit")
    resp = mod.handler({"body": "{not json"}, None)
    assert resp["statusCode"] == 400
    body = parse_body(resp)
    assert body["error"]["code"] == "VALIDATION_ERROR"
