"""seed_places.py: validation, idempotency, dry-run, and seed-file coverage."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from places_common.records import parse_address_parts
from places_common.validate import validate_submit_body

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SEED_FILE = BACKEND_ROOT / "scripts" / "seed_data" / "places_seed.json"


def _load_seed_mod():
    path = BACKEND_ROOT / "scripts" / "seed_places.py"
    spec = importlib.util.spec_from_file_location("seed_places", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_review_mod():
    path = BACKEND_ROOT / "scripts" / "review_place.py"
    spec = importlib.util.spec_from_file_location("review_place", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sample_entry(**overrides):
    entry = {
        "name": "Löyly",
        "place_type": "business",
        "activity_types": ["sauna", "cold_plunge"],
        "address": "Hernesaarenranta 4, 00150 Helsinki, Finland",
        "lat": 60.1521774,
        "lng": 24.9304437,
        "website": "https://www.loylyhelsinki.fi/en/info",
        "source_url": "https://www.openstreetmap.org/way/625576876",
    }
    entry.update(overrides)
    return entry


def near_phoenix(entry: dict) -> bool:
    return 33.2 <= float(entry["lat"]) <= 33.9 and -112.4 <= float(entry["lng"]) <= -111.6


def near_antimeridian(entry: dict) -> bool:
    """True when |lng| >= 170 (Pacific dateline). Hawaii is counted separately if needed."""
    return abs(float(entry["lng"])) >= 170


def test_seed_file_has_required_coverage_and_valid_payloads():
    seed = _load_seed_mod()
    entries = seed.load_seed_entries(SEED_FILE)
    names = {entry["name"] for entry in entries}
    assert len(entries) >= 30
    assert sum(1 for e in entries if near_antimeridian(e)) >= 3
    assert sum(1 for e in entries if near_phoenix(e)) >= 3
    assert names.isdisjoint(
        {"Silver Lake", "Dragon Hill Spa", "To Sua Ocean Trench", "Waimea Valley"}
    )
    fix = next(e for e in entries if e["name"] == "FIX Medical Group Scottsdale")
    assert fix["place_type"] == "business"

    for entry in entries:
        assert entry.get("source_url")
        payload = seed.submit_payload(entry)
        body = {
            "place_name": entry["name"],
            "place_type": entry["place_type"],
            "activity_types": entry["activity_types"],
            "lat": entry["lat"],
            "lng": entry["lng"],
        }
        if entry.get("address"):
            body["address"] = entry["address"]
        expected = validate_submit_body(body)
        assert payload == expected
        assert "website" not in payload
        assert "source_url" not in payload
        assert -90 <= payload["lat"] <= 90
        assert -180 <= payload["lng"] <= 180
        assert len(payload["place_name"]) <= 200
        if payload.get("address"):
            assert len(payload["address"]) <= 500


def test_seed_cities_have_no_digits_or_bare_region_codes():
    seed = _load_seed_mod()
    entries = seed.load_seed_entries(SEED_FILE)
    checked = 0
    for entry in entries:
        address = entry.get("address")
        if not isinstance(address, str) or not address.strip():
            continue
        parsed = parse_address_parts(address)
        city = parsed.get("city")
        assert city, entry.get("name")
        assert city.strip()
        assert not any(ch.isdigit() for ch in city), (entry.get("name"), city)
        assert not (
            len(city) in (2, 3) and city.isalpha() and city.isupper()
        ), (entry.get("name"), city)
        checked += 1
    assert checked >= 30


# Locked against the parser output for every current seed address so optional
# locality tweaks cannot silently change existing rows. US country stays USA.
SEED_ADDRESS_PARSE = {
    "Optimyze Scottsdale": {
        "country": "USA",
        "state_province": "AZ",
        "postal_code": "85258",
        "city": "Scottsdale",
    },
    "RESET Old Town Scottsdale": {
        "country": "USA",
        "state_province": "AZ",
        "postal_code": "85257",
        "city": "Scottsdale",
    },
    "ReConnect Mind Body Scottsdale": {
        "country": "USA",
        "state_province": "AZ",
        "postal_code": "85254",
        "city": "Scottsdale",
    },
    "FIX Medical Group Scottsdale": {
        "country": "USA",
        "state_province": "AZ",
        "postal_code": "85254",
        "city": "Scottsdale",
    },
    "Hanmer Springs Thermal Pools & Spa": {
        "country": "New Zealand",
        "city": "Hanmer Springs",
        "postal_code": "7334",
    },
    "Tekapo Springs": {
        "country": "New Zealand",
        "city": "Lake Tekapo",
        "postal_code": "7945",
    },
    "InterContinental Fiji Golf Resort & Spa": {"country": "Fiji", "city": "Viti Levu"},
    "Kilolani Spa at Grand Wailea": {
        "country": "USA",
        "state_province": "HI",
        "postal_code": "96753",
        "city": "Wailea",
    },
    "Hualalai Spa": {
        "country": "USA",
        "state_province": "HI",
        "postal_code": "96740",
        "city": "Kailua-Kona",
    },
    "Löyly": {"country": "Finland", "postal_code": "00150", "city": "Helsinki"},
    "Allas Sea Pool": {"country": "Finland", "postal_code": "00160", "city": "Helsinki"},
    "Kotiharjun Sauna": {"country": "Finland", "postal_code": "00500", "city": "Helsinki"},
    "Kulttuurisauna": {"country": "Finland", "postal_code": "00530", "city": "Helsinki"},
    "Rajaportin Sauna": {"country": "Finland", "postal_code": "33250", "city": "Tampere"},
    "Sompasauna": {"country": "Finland", "postal_code": "00570", "city": "Helsinki"},
    "Sky Lagoon": {"country": "Iceland", "postal_code": "200", "city": "Kópavogur"},
    "The Well": {"country": "Norway", "postal_code": "1412", "city": "Sofiemyr"},
    "Yasuragi Hasseludden": {
        "country": "Sweden",
        "postal_code": "132 81",
        "city": "Saltsjö-Boo",
    },
    "Community Sauna Baths Hackney Wick": {
        "country": "United Kingdom",
        "city": "London",
        "postal_code": "E9 5JH",
    },
    "Banya No.1 Chiswick": {
        "country": "United Kingdom",
        "city": "London",
        "postal_code": "W4 5TF",
    },
    "Finnish Church in London": {
        "country": "United Kingdom",
        "city": "London",
        "postal_code": "SE16 7HZ",
    },
    "Cold Plunge Coffee": {
        "country": "USA",
        "state_province": "UT",
        "postal_code": "84111",
        "city": "Salt Lake City",
    },
    "Bathhouse Williamsburg": {
        "country": "USA",
        "state_province": "NY",
        "postal_code": "11249",
        "city": "Brooklyn",
    },
    "Othership Yorkville": {
        "country": "Canada",
        "state_province": "ON",
        "postal_code": "M5S 2W7",
        "city": "Toronto",
    },
    "Othership Adelaide": {
        "country": "Canada",
        "state_province": "ON",
        "postal_code": "M5V 3C1",
        "city": "Toronto",
    },
    "Kabuki Springs & Spa": {
        "country": "USA",
        "state_province": "CA",
        "postal_code": "94115",
        "city": "San Francisco",
    },
    "Archimedes Banya": {
        "country": "USA",
        "state_province": "CA",
        "postal_code": "94124",
        "city": "San Francisco",
    },
    "Scandinave Spa Whistler": {
        "country": "Canada",
        "state_province": "BC",
        "postal_code": "V8E 1L1",
        "city": "Whistler",
    },
    "Barton Springs Pool": {
        "country": "USA",
        "state_province": "TX",
        "postal_code": "78746",
        "city": "Austin",
    },
    "Thermae-Yu": {"country": "Japan", "city": "Tokyo", "postal_code": "160-0021"},
    "Spa LaQua": {"country": "Japan", "city": "Tokyo", "postal_code": "112-0003"},
    "Peninsula Hot Springs": {
        "country": "Australia",
        "city": "Fingal",
        "state_province": "VIC",
        "postal_code": "3939",
    },
    "Bondi Icebergs Club": {
        "country": "Australia",
        "city": "Bondi Beach",
        "state_province": "NSW",
        "postal_code": "2026",
    },
    "Spa Land Centum City": {
        "country": "South Korea",
        "city": "Busan",
        "postal_code": "48058",
    },
    "vabali spa Berlin": {"country": "Germany", "postal_code": "10557", "city": "Berlin"},
}


def test_every_seed_address_parses_exactly():
    seed = _load_seed_mod()
    entries = seed.load_seed_entries(SEED_FILE)
    seen = set()
    for entry in entries:
        address = entry.get("address")
        name = entry["name"]
        if not isinstance(address, str) or not address.strip():
            assert name not in SEED_ADDRESS_PARSE
            continue
        seen.add(name)
        assert parse_address_parts(address) == SEED_ADDRESS_PARSE[name], name
    assert seen == set(SEED_ADDRESS_PARSE)


def test_us_seed_entries_keep_country_usa():
    seed = _load_seed_mod()
    entries = seed.load_seed_entries(SEED_FILE)
    us_entries = [
        entry
        for entry in entries
        if isinstance(entry.get("address"), str) and entry["address"].rstrip().endswith("USA")
    ]
    assert len(us_entries) >= 8
    for entry in us_entries:
        parsed = parse_address_parts(entry["address"])
        assert parsed.get("country") == "USA", entry["name"]
        assert parsed.get("city")
        assert parsed.get("state_province")


def test_submit_payload_does_not_forward_location_overrides():
    seed = _load_seed_mod()
    entry = _sample_entry(
        city="Explicit City",
        state_province="EX",
        postal_code="99999",
    )
    payload = seed.submit_payload(entry)
    assert "city" not in payload
    assert "state_province" not in payload
    assert "postal_code" not in payload
    assert payload["address"] == entry["address"]


def test_dry_run_makes_no_requests(tmp_path, capsys, monkeypatch):
    seed = _load_seed_mod()
    called = []

    def _http(*args, **kwargs):
        called.append((args, kwargs))
        raise AssertionError("dry-run must not make HTTP requests")

    monkeypatch.setattr(seed, "http_json", _http)
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [_sample_entry()]}))
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(tmp_path / "state.json"),
            "--output",
            str(tmp_path / "out.json"),
            "--dry-run",
        ]
    )
    assert seed.run(args) == 0
    assert called == []
    assert not (tmp_path / "out.json").exists()
    printed = capsys.readouterr().out
    assert "Hernesaarenranta" in printed
    assert '"dry_run": true' in printed


def test_state_file_is_respected(tmp_path, monkeypatch):
    seed = _load_seed_mod()
    entry = _sample_entry()
    key = seed.seed_key(entry)
    state_path = tmp_path / "state.json"
    state_path.write_text(json.dumps({key: {"place_id": "already-there"}}))
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [entry]}))

    def _http(*args, **kwargs):
        raise AssertionError("state-file skip must not call HTTP")

    monkeypatch.setattr(seed, "http_json", _http)
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(state_path),
            "--output",
            str(tmp_path / "out.json"),
            "--base-url",
            "https://example.test/dev",
        ]
    )
    assert seed.run(args) == 0
    out = json.loads((tmp_path / "out.json").read_text())
    assert out["place_ids"] == []


def test_existing_search_match_skips_submit(tmp_path, monkeypatch):
    seed = _load_seed_mod()
    entry = _sample_entry()
    calls = []

    def _http(method, url, body=None, timeout=30.0):
        calls.append((method, url, body))
        if method == "GET":
            return 200, {
                "places": [
                    {
                        "place_id": "existing-1",
                        "place_name": "Löyly",
                        "lat": 60.1522,
                        "lng": 24.9305,
                    }
                ]
            }
        raise AssertionError("submit should be skipped on a confident match")

    monkeypatch.setattr(seed, "http_json", _http)
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [entry]}))
    state_path = tmp_path / "state.json"
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(state_path),
            "--output",
            str(tmp_path / "out.json"),
            "--base-url",
            "https://example.test/dev",
            "--sleep",
            "0",
        ]
    )
    assert seed.run(args) == 0
    assert [c[0] for c in calls] == ["GET"]
    assert "/search?" in calls[0][1]
    out = json.loads((tmp_path / "out.json").read_text())
    assert out["place_ids"] == []
    state = json.loads(state_path.read_text())
    assert state[seed.seed_key(entry)]["place_id"] == "existing-1"


def test_submit_writes_state_and_output(tmp_path, monkeypatch):
    seed = _load_seed_mod()
    entry = _sample_entry()
    calls = []

    def _http(method, url, body=None, timeout=30.0):
        calls.append((method, url, body))
        if method == "GET":
            return 200, {"places": []}
        assert method == "POST"
        assert url.endswith("/submit")
        assert body["place_name"] == "Löyly"
        assert "website" not in body
        return 201, {"place_id": "new-place", "submission_id": "sub_1", "place_slug": "loyly", "is_approved": False}

    monkeypatch.setattr(seed, "http_json", _http)
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [entry]}))
    state_path = tmp_path / "state.json"
    out_path = tmp_path / "out.json"
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(state_path),
            "--output",
            str(out_path),
            "--base-url",
            "https://example.test/dev",
            "--sleep",
            "0",
        ]
    )
    assert seed.run(args) == 0
    assert [c[0] for c in calls] == ["GET", "POST"]
    out = json.loads(out_path.read_text())
    assert out["place_ids"] == ["new-place"]
    state = json.loads(state_path.read_text())
    assert state[seed.seed_key(entry)]["place_id"] == "new-place"


def test_limit_and_distant_same_name_is_not_a_match():
    seed = _load_seed_mod()
    entry = _sample_entry()
    far = {"place_name": "Löyly", "lat": 40.7, "lng": -74.0}
    assert seed.is_confident_match(entry, far) is False
    close = {"place_name": "Loyly", "lat": 60.1522, "lng": 24.9305}
    assert seed.is_confident_match(entry, close) is True


def test_review_place_ids_from_seed_output():
    review = _load_review_mod()
    payload = {
        "created": [
            {"key": "a", "place_id": "p1"},
            {"key": "b", "place_id": "p2"},
        ],
        "place_ids": ["p1", "p2", "p3"],
    }
    assert review.place_ids_from_output(payload) == ["p1", "p2", "p3"]
    assert review.place_ids_from_output(["x", {"place_id": "y"}]) == ["x", "y"]
    assert review.place_ids_from_output({"place_id": "solo"}) == ["solo"]


def test_sleep_between_api_calls(tmp_path, monkeypatch):
    seed = _load_seed_mod()
    sleeps: list[float] = []
    monkeypatch.setattr(seed.time, "sleep", lambda seconds: sleeps.append(seconds))

    def _http(method, url, body=None, timeout=30.0):
        if method == "GET":
            return 200, {"places": []}
        return 201, {
            "place_id": "new-place",
            "submission_id": "sub_1",
            "place_slug": "loyly",
            "is_approved": False,
        }

    monkeypatch.setattr(seed, "http_json", _http)
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [_sample_entry()]}))
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(tmp_path / "state.json"),
            "--output",
            str(tmp_path / "out.json"),
            "--base-url",
            "https://example.test/dev",
            "--sleep",
            "0.25",
        ]
    )
    assert seed.run(args) == 0
    assert sleeps == [0.25]


def test_dry_run_does_not_sleep(tmp_path, monkeypatch, capsys):
    seed = _load_seed_mod()
    sleeps: list[float] = []
    monkeypatch.setattr(seed.time, "sleep", lambda seconds: sleeps.append(seconds))
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [_sample_entry()]}))
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(tmp_path / "state.json"),
            "--output",
            str(tmp_path / "out.json"),
            "--dry-run",
            "--sleep",
            "0.25",
        ]
    )
    assert seed.run(args) == 0
    assert sleeps == []


def test_created_output_merges_and_dedupes(tmp_path, monkeypatch):
    seed = _load_seed_mod()
    out_path = tmp_path / "out.json"
    out_path.write_text(
        json.dumps(
            {
                "created": [{"key": "old", "place_id": "old-id", "place_name": "Old"}],
                "place_ids": ["old-id"],
            }
        )
    )

    def _http(method, url, body=None, timeout=30.0):
        if method == "GET":
            return 200, {"places": []}
        return 201, {
            "place_id": "new-place",
            "submission_id": "sub_1",
            "place_slug": "loyly",
            "is_approved": False,
        }

    monkeypatch.setattr(seed, "http_json", _http)
    seed_file = tmp_path / "places.json"
    seed_file.write_text(json.dumps({"places": [_sample_entry()]}))
    args = seed.build_parser().parse_args(
        [
            "--seed-file",
            str(seed_file),
            "--state-file",
            str(tmp_path / "state.json"),
            "--output",
            str(out_path),
            "--base-url",
            "https://example.test/dev",
            "--sleep",
            "0",
        ]
    )
    assert seed.run(args) == 0
    out = json.loads(out_path.read_text())
    assert out["place_ids"] == ["old-id", "new-place"]
    assert [row["place_id"] for row in out["created"]] == ["old-id", "new-place"]

    # Re-run with the same new id already in the file: still one copy.
    merged = seed.merge_created_output(out, [{"key": "x", "place_id": "new-place"}])
    assert merged["place_ids"] == ["old-id", "new-place"]


def test_seed_rejects_limit_below_one():
    seed = _load_seed_mod()
    parser = seed.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["--limit", "0"])
    with pytest.raises(SystemExit):
        parser.parse_args(["--limit", "-3"])


def test_review_rejects_limit_below_one():
    review = _load_review_mod()
    parser = review.build_parser()
    args = parser.parse_args(
        ["--from-file", "out.json", "--decision", "active", "--limit", "0"]
    )
    with pytest.raises(SystemExit):
        review.validate_review_args(parser, args)
    args = parser.parse_args(
        ["--from-file", "out.json", "--decision", "active", "--limit", "-1"]
    )
    with pytest.raises(SystemExit):
        review.validate_review_args(parser, args)


def test_review_rejects_limit_without_from_file():
    review = _load_review_mod()
    parser = review.build_parser()
    args = parser.parse_args(
        ["--place-id", "place-1", "--decision", "active", "--limit", "2"]
    )
    with pytest.raises(SystemExit):
        review.validate_review_args(parser, args)


def test_review_cli_rejects_invalid_decision():
    review = _load_review_mod()
    with pytest.raises(SystemExit):
        review.build_parser().parse_args(["--place-id", "x", "--decision", "approved"])
    with pytest.raises(SystemExit):
        review.build_parser().parse_args(["--place-id", "x", "--decision", "pending"])


def test_review_cli_single_revert(dynamodb_tables):
    from tests.conftest import SAMPLE_PLACE

    review = _load_review_mod()
    table = dynamodb_tables.Table("Places_Places")
    item = dict(SAMPLE_PLACE)
    item.update(
        {
            "internal_status": "active",
            "is_approved": True,
            "reviewed_ts": "2026-03-01T00:00:00Z",
            "reviewed_by": "admin",
            "ts_reviewed": "2026-03-01T00:00:00Z",
            "reviewer": "admin",
            "internal_verified": True,
            "internal_verified_ts": "2026-03-01T00:00:00Z",
            "internal_comments": "demo approved",
        }
    )
    table.put_item(Item=item)

    result = review.review_one(table, item["place_id"], "in_review", None)
    assert result["internal_status"] == "in_review"
    assert result["is_approved"] is False

    stored = table.get_item(Key={"place_id": item["place_id"]})["Item"]
    assert stored["internal_status"] == "in_review"
    assert stored["internal_verified"] is False
    assert "is_approved" not in stored
    assert "reviewed_ts" not in stored
    assert "reviewed_by" not in stored
    assert "ts_reviewed" not in stored
    assert "reviewer" not in stored
    assert "internal_comments" not in stored
    assert "internal_verified_ts" not in stored


def test_review_cli_bulk_revert(dynamodb_tables, tmp_path, monkeypatch, capsys):
    from tests.conftest import SAMPLE_PLACE

    review = _load_review_mod()
    table = dynamodb_tables.Table("Places_Places")
    ids = ["bulk-1", "bulk-2", "bulk-3"]
    for pid in ids:
        item = dict(SAMPLE_PLACE)
        item["place_id"] = pid
        item["internal_status"] = "active"
        item["is_approved"] = True
        item["reviewed_ts"] = "2026-03-01T00:00:00Z"
        item["reviewer"] = "admin"
        table.put_item(Item=item)

    out = tmp_path / "created.json"
    out.write_text(json.dumps({"place_ids": ids}), encoding="utf-8")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "review_place.py",
            "--from-file",
            str(out),
            "--limit",
            "2",
            "--decision",
            "in_review",
        ],
    )
    assert review.main() == 0
    captured = json.loads(capsys.readouterr().out)
    assert captured["count"] == 2
    assert [row["place_id"] for row in captured["reviewed"]] == ["bulk-1", "bulk-2"]
    assert all(row["internal_status"] == "in_review" for row in captured["reviewed"])
    assert all(row["is_approved"] is False for row in captured["reviewed"])

    for pid in ("bulk-1", "bulk-2"):
        stored = table.get_item(Key={"place_id": pid})["Item"]
        assert stored["internal_status"] == "in_review"
        assert "is_approved" not in stored
        assert "reviewed_ts" not in stored
        assert "reviewer" not in stored
        assert "internal_comments" not in stored
        assert "internal_verified_ts" not in stored

    leftover = table.get_item(Key={"place_id": "bulk-3"})["Item"]
    assert leftover["internal_status"] == "active"
    assert leftover["reviewed_ts"] == "2026-03-01T00:00:00Z"
