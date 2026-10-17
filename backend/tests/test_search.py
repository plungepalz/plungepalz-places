"""Places_Search: validation, bbox precedence, filters, pagination, sanitizing."""

from __future__ import annotations

import json

from tests.conftest import api_event, load_handler, parse_body


def _mod(fake_algolia, monkeypatch):
    monkeypatch.setenv("ALGOLIA_APP_ID", "testapp")
    monkeypatch.setenv("ALGOLIA_SEARCH_API_KEY", "searchkey")
    mod = load_handler("Places_Search")
    monkeypatch.setattr(mod, "_get_index", lambda: fake_algolia)
    return mod


def _hit(**overrides):
    base = {
        "objectID": "p1",
        "place_id": "p1",
        "place_slug": "plunge-lab-salt-lake-city",
        "place_name": "Plunge Lab",
        "place_type": "business",
        "address": "457 E 300 S",
        "city": "Salt Lake City",
        "state_province": "UT",
        "country": "USA",
        "activity_types": ["cold_plunge", "sauna"],
        "description": "A studio.",
        "cover_image": None,
        "lat": 40.7608,
        "lng": -111.891,
        "is_approved": False,
        "ts_created": "2026-02-20T12:00:00Z",
        "internal_status": "in_review",
        "visibility": "public",
        "internal_comments": "secret",
    }
    base.update(overrides)
    return base


def test_search_default_ok(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 1}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert body["total"] == 1
    assert body["page"] == 0
    assert body["limit"] == 100
    assert body["has_more"] is False
    assert len(body["places"]) == 1
    place = body["places"][0]
    assert place["place_id"] == "p1"
    assert place["is_approved"] is False
    assert place["ts_created"] == "2026-02-20T12:00:00Z"
    assert "created_ts" not in place
    assert isinstance(place["lat"], float)
    assert "internal_status" not in place
    assert "internal_comments" not in place


def test_search_400_bad_bbox(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    cases = [
        {"bbox": "1,2,3"},
        {"bbox": "not-a-bbox"},
        {"bbox": "nan,40,41,42"},
        {"bbox": "-111,41,-110,40"},  # minLat >= maxLat
        {"bbox": "180,40,180,41"},  # zero-width after clamp
    ]
    for query in cases:
        resp = mod.handler(api_event(query=query), None)
        assert resp["statusCode"] == 400, query
        body = parse_body(resp)
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "bbox" in body["error"]["details"]


def test_search_bbox_wraps_unwrapped_lng_and_splits(fake_algolia, monkeypatch):
    """170,-30,190,10 wraps 190 → -170 and splits across the antimeridian."""
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"bbox": "170,-30,190,10"}), None)
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert opts["insideBoundingBox"] == [
        [-30.0, 170.0, 10.0, 180.0],
        [-30.0, -180.0, 10.0, -170.0],
    ]


def test_search_bbox_wraps_west_past_180_and_splits(fake_algolia, monkeypatch):
    """-200,10,-150,30 wraps -200 → 160, then 160 > -150 so it splits."""
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"bbox": "-200,10,-150,30"}), None)
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert opts["insideBoundingBox"] == [
        [10.0, 160.0, 30.0, 180.0],
        [10.0, -180.0, 30.0, -150.0],
    ]


def test_search_bbox_prewrapped_antimeridian_split(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"bbox": "170,-30,-170,10"}), None)
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert opts["insideBoundingBox"] == [
        [-30.0, 170.0, 10.0, 180.0],
        [-30.0, -180.0, 10.0, -170.0],
    ]


def test_search_bbox_span_at_least_360_is_whole_world(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"bbox": "-200,-100,200,100"}), None)
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert opts["insideBoundingBox"] == [[-90.0, -180.0, 90.0, 180.0]]


def test_search_400_lat_lng_range_and_partial(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)

    resp = mod.handler(api_event(query={"lat": "91", "lng": "-111"}), None)
    assert resp["statusCode"] == 400
    assert "lat" in parse_body(resp)["error"]["details"]

    resp = mod.handler(api_event(query={"lat": "40", "lng": "-200"}), None)
    assert resp["statusCode"] == 400
    assert "lng" in parse_body(resp)["error"]["details"]

    resp = mod.handler(api_event(query={"lat": "40.7"}), None)
    assert resp["statusCode"] == 400
    assert "lng" in parse_body(resp)["error"]["details"]

    resp = mod.handler(api_event(query={"lng": "-111.8"}), None)
    assert resp["statusCode"] == 400
    assert "lat" in parse_body(resp)["error"]["details"]


def test_search_400_unknown_enum(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"place_type": "business,cafe"}), None)
    assert resp["statusCode"] == 400
    assert "place_type" in parse_body(resp)["error"]["details"]

    resp = mod.handler(api_event(query={"activity_types": "hot_tub"}), None)
    assert resp["statusCode"] == 400
    assert "activity_types" in parse_body(resp)["error"]["details"]


def test_search_400_limit_and_page(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    for query in (
        {"limit": "0"},
        {"limit": "501"},
        {"limit": "abc"},
        {"page": "-1"},
        {"page": "1.5"},
        {"approved_only": "yes"},
    ):
        resp = mod.handler(api_event(query=query), None)
        assert resp["statusCode"] == 400, query


def test_search_limit_cap_500_ok(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"limit": "500"}), None)
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert opts["offset"] == 0
    assert opts["length"] == 500
    assert "page" not in opts
    assert "hitsPerPage" not in opts


def test_search_bbox_wins_over_geo(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(
        api_event(
            query={
                "bbox": "-112,40,-111,41",
                "lat": "40.76",
                "lng": "-111.89",
                "radius_km": "25",
            }
        ),
        None,
    )
    assert resp["statusCode"] == 200
    opts = fake_algolia.searches[0][1]
    assert "insideBoundingBox" in opts
    # Algolia order: minLat, minLng, maxLat, maxLng
    assert opts["insideBoundingBox"] == [[40.0, -112.0, 41.0, -111.0]]
    assert "aroundLatLng" not in opts
    assert "aroundRadius" not in opts


def test_search_geo_when_no_bbox(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    mod.handler(api_event(query={"lat": "40.76", "lng": "-111.89"}), None)
    opts = fake_algolia.searches[0][1]
    assert opts["aroundLatLng"] == "40.76,-111.89"
    assert opts["aroundRadius"] == 10000  # default 10 km


def test_search_approved_only_filter(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    mod.handler(api_event(query={"approved_only": "true"}), None)
    filters = fake_algolia.searches[0][1]["filters"]
    assert "internal_status:active" in filters
    assert "NOT internal_status:rejected" in filters
    assert "NOT visibility:hidden" in filters


def test_search_excludes_rejected_and_hidden_hits(fake_algolia, monkeypatch):
    fake_algolia.search_result = {
        "hits": [
            _hit(place_id="ok", objectID="ok"),
            _hit(place_id="rej", objectID="rej", internal_status="rejected"),
            _hit(place_id="hid", objectID="hid", visibility="hidden"),
        ],
        "nbHits": 3,
    }
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={}), None))
    ids = [p["place_id"] for p in body["places"]]
    assert ids == ["ok"]


def test_search_strips_internal_fields(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 1}
    mod = _mod(fake_algolia, monkeypatch)
    place = parse_body(mod.handler(api_event(query={}), None))["places"][0]
    dumped = json.dumps(place)
    assert "internal_status" not in dumped
    assert "internal_comments" not in dumped
    assert "secret" not in dumped


def test_search_pagination_has_more(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 250}
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "0"}), None))
    assert body["has_more"] is True
    assert body["page"] == 0
    assert body["limit"] == 100

    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 250}
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "2"}), None))
    assert body["has_more"] is False


def test_search_has_more_respects_algolia_1000_cap(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 2500}
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "8"}), None))
    assert body["has_more"] is True
    assert body["total"] == 2500

    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 2500}
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "9"}), None))
    assert body["has_more"] is False


def test_search_has_more_uses_pagination_limited_to(fake_algolia, monkeypatch):
    fake_algolia.search_result = {
        "hits": [_hit()],
        "nbHits": 2500,
        "paginationLimitedTo": 500,
    }
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "4"}), None))
    assert body["has_more"] is False
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "3"}), None))
    assert body["has_more"] is True


def test_search_never_requests_past_pagination_cap(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 2500}
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "100", "page": "10"}), None))
    assert body["has_more"] is False
    assert body["places"] == []
    assert body["total"] == 2500
    assert len(fake_algolia.searches) == 1
    opts = fake_algolia.searches[0][1]
    assert opts["offset"] == 0
    assert opts["length"] == 0


def test_search_offset_length_near_cap_limit_300_page_3(fake_algolia, monkeypatch):
    """limit=300&page=3 must request offset=900,length=100 (hits 900-999), not page=3."""
    fake_algolia.search_result = {"hits": [_hit(place_id="near-cap")], "nbHits": 2500}
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "300", "page": "3"}), None))
    assert body["has_more"] is False
    opts = fake_algolia.searches[0][1]
    assert opts["offset"] == 900
    assert opts["length"] == 100
    assert "page" not in opts
    assert "hitsPerPage" not in opts


def test_search_offset_past_cap_returns_real_total(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 2500}
    mod = _mod(fake_algolia, monkeypatch)
    body = parse_body(mod.handler(api_event(query={"limit": "300", "page": "4"}), None))
    assert body["places"] == []
    assert body["has_more"] is False
    assert body["total"] == 2500
    assert body["page"] == 4
    assert body["limit"] == 300
    assert len(fake_algolia.searches) == 1
    opts = fake_algolia.searches[0][1]
    assert opts["offset"] == 0
    assert opts["length"] == 0
    assert "hitsPerPage" not in opts


def test_search_clamps_length_to_remaining_cap(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [_hit()], "nbHits": 2500}
    mod = _mod(fake_algolia, monkeypatch)
    mod.handler(api_event(query={"limit": "150", "page": "6"}), None)
    opts = fake_algolia.searches[0][1]
    assert opts["offset"] == 900
    assert opts["length"] == 100  # 900 + 100 = 1000, not 1050


def test_search_activity_and_place_type_filters(fake_algolia, monkeypatch):
    fake_algolia.search_result = {"hits": [], "nbHits": 0}
    mod = _mod(fake_algolia, monkeypatch)
    mod.handler(
        api_event(query={"place_type": "business,nature", "activity_types": "sauna"}),
        None,
    )
    filters = fake_algolia.searches[0][1]["filters"]
    assert "place_type:business" in filters
    assert "place_type:nature" in filters
    assert "activity_types:sauna" in filters


def test_search_no_geo_is_global_catalog_newest_first(fake_algolia, monkeypatch):
    """Neither bbox nor lat/lng: paginated global catalog, newest ts_created first."""
    fake_algolia.search_result = {
        "hits": [
            _hit(
                place_id="old",
                objectID="old",
                ts_created="2026-01-01T00:00:00Z",
                ts_created_unix=1767225600,
            ),
            _hit(
                place_id="new",
                objectID="new",
                ts_created="2026-03-01T00:00:00Z",
                ts_created_unix=1772323200,
            ),
        ],
        "nbHits": 2,
    }
    mod = _mod(fake_algolia, monkeypatch)
    resp = mod.handler(api_event(query={"page": "0", "limit": "100"}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert [p["place_id"] for p in body["places"]] == ["new", "old"]
    assert body["places"][0]["ts_created"] == "2026-03-01T00:00:00Z"
    q, opts = fake_algolia.searches[0]
    assert q == ""
    assert "insideBoundingBox" not in opts
    assert "aroundLatLng" not in opts
    assert "aroundRadius" not in opts


def test_algolia_settings_custom_ranking_newest_first():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "scripts" / "algolia_index_settings.py"
    spec = importlib.util.spec_from_file_location("algolia_index_settings", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.SETTINGS["customRanking"] == ["desc(ts_created_unix)"]
    ranking = mod.SETTINGS["ranking"]
    assert ranking.index("geo") < ranking.index("custom")
    assert ranking.index("typo") < ranking.index("custom")
    assert ranking.index("words") < ranking.index("custom")
    assert "ts_created" in mod.SETTINGS["attributesToRetrieve"]
    assert "postal_code" in mod.SETTINGS["attributesToRetrieve"]
    assert "created_ts" not in mod.SETTINGS["attributesToRetrieve"]
    assert "ts_created_unix" not in mod.SETTINGS["attributesToRetrieve"]
    assert mod.SETTINGS["attributesToRetrieve"] == [
        "place_id",
        "place_slug",
        "place_name",
        "place_type",
        "address",
        "city",
        "state_province",
        "country",
        "postal_code",
        "activity_types",
        "description",
        "cover_image",
        "lat",
        "lng",
        "is_approved",
        "ts_created",
        "_geoloc",
    ]
    assert mod.SETTINGS == {
        "searchableAttributes": [
            "place_name",
            "description",
            "address",
            "city",
            "state_province",
            "country",
            "unordered(tags)",
        ],
        "attributesForFaceting": [
            "filterOnly(internal_status)",
            "filterOnly(visibility)",
            "filterOnly(place_type)",
            "filterOnly(activity_types)",
            "filterOnly(is_approved)",
        ],
        "unretrievableAttributes": [
            "internal_status",
            "internal_comments",
        ],
        "attributesToRetrieve": mod.SETTINGS["attributesToRetrieve"],
        "customRanking": ["desc(ts_created_unix)"],
        "ranking": [
            "typo",
            "geo",
            "words",
            "filters",
            "proximity",
            "attribute",
            "exact",
            "custom",
        ],
        "hitsPerPage": 100,
        "maxValuesPerFacet": 20,
        "ignorePlurals": True,
        "removeStopWords": True,
    }
