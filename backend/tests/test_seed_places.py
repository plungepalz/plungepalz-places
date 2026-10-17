"""seed_places.py: validation, idempotency, dry-run, and seed-file coverage."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

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
    lat = float(entry["lat"])
    lng = float(entry["lng"])
    if abs(lng) >= 170:
        return True
    blob = f"{entry.get('name', '')} {entry.get('address', '')}".lower()
    if any(token in blob for token in ("hawaii", "fiji", "new zealand", "samoa", "wailea", "haleiwa")):
        return True
    if 18.9 <= lat <= 22.5 and -160.5 <= lng <= -154.5:
        return True
    if -47.5 <= lat <= -34.0 and 166.0 <= lng <= 179.0:
        return True
    if -19.5 <= lat <= -16.0 and 176.0 <= lng <= 180.0:
        return True
    return False


def test_seed_file_has_required_coverage_and_valid_payloads():
    seed = _load_seed_mod()
    entries = seed.load_seed_entries(SEED_FILE)
    assert len(entries) >= 30
    assert sum(1 for e in entries if near_antimeridian(e)) >= 3
    assert sum(1 for e in entries if near_phoenix(e)) >= 3

    for entry in entries:
        assert entry.get("source_url")
        payload = seed.submit_payload(entry)
        expected = validate_submit_body(
            {
                "place_name": entry["name"],
                "place_type": entry["place_type"],
                "activity_types": entry["activity_types"],
                "lat": entry["lat"],
                "lng": entry["lng"],
                **({"address": entry["address"]} if entry.get("address") else {}),
            }
        )
        assert payload == expected
        assert "website" not in payload
        assert "source_url" not in payload
        assert -90 <= payload["lat"] <= 90
        assert -180 <= payload["lng"] <= 180
        assert len(payload["place_name"]) <= 200
        if payload.get("address"):
            assert len(payload["address"]) <= 500


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
