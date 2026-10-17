"""Places_AlgoliaSync: upsert, delete, Decimal handling, batching."""

from __future__ import annotations

from decimal import Decimal

from tests.conftest import api_event, load_handler, parse_body
from tests.test_submit import VALID as SUBMIT_BODY


def _stream_record(event_name, *, new=None, old=None, place_id="p1"):
    def image(item):
        if item is None:
            return None
        out = {}
        for key, value in item.items():
            if value is None:
                out[key] = {"NULL": True}
            elif isinstance(value, bool):
                out[key] = {"BOOL": value}
            elif isinstance(value, (int, float, Decimal)):
                out[key] = {"N": str(value)}
            elif isinstance(value, list):
                out[key] = {"L": [{"S": str(v)} for v in value]}
            else:
                out[key] = {"S": str(value)}
        return out

    rec = {
        "eventName": event_name,
        "dynamodb": {
            "Keys": {"place_id": {"S": place_id}},
        },
    }
    if new is not None:
        rec["dynamodb"]["NewImage"] = image(new)
    if old is not None:
        rec["dynamodb"]["OldImage"] = image(old)
    return rec


def _place(**overrides):
    base = {
        "place_id": "p1",
        "place_slug": "plunge-lab-salt-lake-city",
        "place_name": "Plunge Lab",
        "place_type": "business",
        "visibility": "public",
        "activity_types": ["sauna"],
        "lat": Decimal("40.7608"),
        "lng": Decimal("-111.8910"),
        "internal_status": "in_review",
        "ts_created": "2026-02-20T12:00:00Z",
        "description": "Studio",
        "cover_image": None,
    }
    base.update(overrides)
    return base


def _mod(fake_algolia, monkeypatch):
    monkeypatch.setenv("ALGOLIA_APP_ID", "testapp")
    monkeypatch.setenv("ALGOLIA_WRITE_API_KEY", "writekey")
    mod = load_handler("Places_AlgoliaSync")
    monkeypatch.setattr(mod, "_get_index", lambda: fake_algolia)
    return mod


def test_algolia_sync_insert_upserts(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    place = _place()
    result = mod.handler({"Records": [_stream_record("INSERT", new=place)]}, None)
    assert result["upserted"] == 1
    obj = fake_algolia.objects["p1"]
    assert obj["objectID"] == "p1"
    assert obj["_geoloc"]["lat"] == 40.7608
    assert obj["_geoloc"]["lng"] == -111.891
    assert isinstance(obj["lat"], float)
    assert isinstance(obj["lng"], float)
    assert obj["internal_status"] == "in_review"
    assert obj["is_approved"] is False
    assert obj["ts_created"] == "2026-02-20T12:00:00Z"
    assert "created_ts" not in obj
    assert obj["ts_created_unix"] == 1771588800  # 2026-02-20T12:00:00Z


def test_algolia_sync_modify_upserts(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    old = _place(internal_status="in_review")
    new = _place(internal_status="active")
    mod.handler({"Records": [_stream_record("MODIFY", new=new, old=old)]}, None)
    assert fake_algolia.objects["p1"]["is_approved"] is True
    assert fake_algolia.objects["p1"]["internal_status"] == "active"


def test_algolia_sync_delete_on_rejected(fake_algolia, monkeypatch):
    fake_algolia.objects["p1"] = {"objectID": "p1"}
    mod = _mod(fake_algolia, monkeypatch)
    place = _place(internal_status="rejected")
    mod.handler({"Records": [_stream_record("MODIFY", new=place, old=_place())]}, None)
    assert "p1" not in fake_algolia.objects
    assert "p1" in fake_algolia.deleted


def test_algolia_sync_delete_on_hidden(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    place = _place(visibility="hidden")
    mod.handler({"Records": [_stream_record("INSERT", new=place)]}, None)
    assert fake_algolia.deleted == ["p1"]
    assert "p1" not in fake_algolia.objects


def test_algolia_sync_delete_on_remove(fake_algolia, monkeypatch):
    fake_algolia.objects["p1"] = {"objectID": "p1"}
    mod = _mod(fake_algolia, monkeypatch)
    mod.handler({"Records": [_stream_record("REMOVE", old=_place())]}, None)
    assert "p1" in fake_algolia.deleted
    assert "p1" not in fake_algolia.objects


def test_algolia_sync_batch_mixed(fake_algolia, monkeypatch):
    mod = _mod(fake_algolia, monkeypatch)
    records = [
        _stream_record("INSERT", new=_place(place_id="a"), place_id="a"),
        _stream_record("INSERT", new=_place(place_id="b", internal_status="rejected"), place_id="b"),
        _stream_record("REMOVE", old=_place(place_id="c"), place_id="c"),
    ]
    result = mod.handler({"Records": records}, None)
    assert result["upserted"] == 1
    assert result["deleted"] == 2
    assert "a" in fake_algolia.objects
    assert "b" in fake_algolia.deleted
    assert "c" in fake_algolia.deleted


def test_algolia_sync_revert_matches_fresh_in_review(fake_algolia, monkeypatch, dynamodb_tables):
    """A reverted place syncs as pending through the normal stream path."""
    table = dynamodb_tables.Table("Places_Places")
    submit = load_handler("Places_Submit")
    review = load_handler("Places_AdminReview")
    sync = _mod(fake_algolia, monkeypatch)

    fresh_id = parse_body(submit.handler(api_event(body=SUBMIT_BODY), None))["place_id"]
    fresh = table.get_item(Key={"place_id": fresh_id})["Item"]

    reverted_id = parse_body(
        submit.handler(api_event(body={**SUBMIT_BODY, "place_name": "Other Lab"}), None)
    )["place_id"]
    assert (
        review.handler(api_event(body={"place_id": reverted_id, "decision": "active"}), None)[
            "statusCode"
        ]
        == 200
    )
    approved = table.get_item(Key={"place_id": reverted_id})["Item"]
    assert (
        review.handler(api_event(body={"place_id": reverted_id, "decision": "in_review"}), None)[
            "statusCode"
        ]
        == 200
    )
    reverted = table.get_item(Key={"place_id": reverted_id})["Item"]

    result = sync.handler(
        {
            "Records": [
                _stream_record("INSERT", new=fresh, place_id=fresh_id),
                _stream_record("MODIFY", new=reverted, old=approved, place_id=reverted_id),
            ]
        },
        None,
    )
    assert result["upserted"] == 2
    assert result["deleted"] == 0
    assert reverted_id not in fake_algolia.deleted

    fresh_obj = fake_algolia.objects[fresh_id]
    reverted_obj = fake_algolia.objects[reverted_id]
    assert fresh_obj["internal_status"] == "in_review"
    assert reverted_obj["internal_status"] == "in_review"
    assert fresh_obj["is_approved"] is False
    assert reverted_obj["is_approved"] is False
    assert fresh_obj["visibility"] == reverted_obj["visibility"] == "public"
    for key in ("internal_status", "is_approved", "visibility"):
        assert fresh_obj[key] == reverted_obj[key]
