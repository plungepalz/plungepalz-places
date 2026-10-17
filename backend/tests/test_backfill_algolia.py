"""backfill_algolia.py: mapping parity, dry-run, pagination, skip/delete, prune."""

from __future__ import annotations

import importlib.util
import sys
from decimal import Decimal

from tests.conftest import BACKEND_ROOT, FakeAlgoliaIndex
from tests.test_algolia_sync import _mod, _place, _stream_record


def load_backfill():
    path = BACKEND_ROOT / "scripts" / "backfill_algolia.py"
    spec = importlib.util.spec_from_file_location("backfill_algolia", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["backfill_algolia"] = mod
    spec.loader.exec_module(mod)
    return mod


def _seed(table, *items):
    for item in items:
        table.put_item(Item=item)


def test_mapping_matches_algolia_sync_output(dynamodb_tables, fake_algolia, monkeypatch):
    place = _place(
        place_id="p1",
        city="Salt Lake City",
        state_province="UT",
        country="USA",
        address="457 E 300 S, Salt Lake City, UT 84111",
        lat=Decimal("40.7608"),
        lng=Decimal("-111.8910"),
        ts_created="2026-02-20T12:00:00Z",
    )
    sync = _mod(fake_algolia, monkeypatch)
    sync.handler({"Records": [_stream_record("INSERT", new=place)]}, None)
    sync_obj = fake_algolia.objects["p1"]

    table = dynamodb_tables.Table("Places_Places")
    _seed(table, place)
    backfill_index = FakeAlgoliaIndex()
    mod = load_backfill()
    summary = mod.run_backfill(index=backfill_index, table=table)

    assert summary["indexed"] == 1
    assert summary["errors"] == 0
    assert backfill_index.objects["p1"] == sync_obj
    assert backfill_index.objects["p1"]["objectID"] == "p1"
    assert backfill_index.objects["p1"]["_geoloc"] == {"lat": 40.7608, "lng": -111.891}
    assert backfill_index.objects["p1"]["ts_created_unix"] == 1771588800


def test_dry_run_makes_no_writes_and_needs_no_algolia_creds(dynamodb_tables, monkeypatch):
    monkeypatch.delenv("ALGOLIA_APP_ID", raising=False)
    monkeypatch.delenv("ALGOLIA_WRITE_API_KEY", raising=False)
    table = dynamodb_tables.Table("Places_Places")
    _seed(table, _place(place_id="p1"), _place(place_id="p2", internal_status="rejected"))

    mod = load_backfill()

    def boom():
        raise AssertionError("dry-run must not open an Algolia client")

    monkeypatch.setattr(mod, "_get_index", boom)
    fake = FakeAlgoliaIndex()
    fake.objects["stale"] = {"objectID": "stale"}

    summary = mod.run_backfill(dry_run=True, prune=True, index=fake, table=table)

    assert summary["scanned"] == 2
    assert summary["indexed"] == 1
    assert summary["deleted"] == 1
    assert summary["deleted_reasons"] == {"rejected": 1}
    assert summary["pruned"] == 0
    assert summary["prune_skipped"] == "dry_run"
    assert summary["samples"]
    assert fake.save_calls == []
    assert fake.delete_calls == []
    assert fake.browse_calls == []
    assert fake.objects == {"stale": {"objectID": "stale"}}

    exit_code = mod.main(["--dry-run"])
    assert exit_code == 0


def test_pagination_across_multiple_scan_pages(dynamodb_tables, fake_algolia):
    table = dynamodb_tables.Table("Places_Places")
    items = [_place(place_id=f"p{i}", place_name=f"Place {i}") for i in range(5)]
    _seed(table, *items)

    scan_calls = {"n": 0}
    original_scan = table.scan

    def counting_scan(**kwargs):
        scan_calls["n"] += 1
        return original_scan(**kwargs)

    table.scan = counting_scan

    mod = load_backfill()
    summary = mod.run_backfill(index=fake_algolia, table=table, scan_page_size=2)

    assert summary["scanned"] == 5
    assert summary["indexed"] == 5
    assert summary["scan_pages"] >= 3
    assert scan_calls["n"] >= 3
    assert set(fake_algolia.objects) == {f"p{i}" for i in range(5)}


def test_skip_and_delete_rules_match_algolia_sync(dynamodb_tables, fake_algolia, monkeypatch):
    table = dynamodb_tables.Table("Places_Places")
    _seed(
        table,
        _place(place_id="ok"),
        _place(place_id="rej", internal_status="rejected"),
        _place(place_id="hid", visibility="hidden"),
    )
    fake_algolia.objects["rej"] = {"objectID": "rej"}
    fake_algolia.objects["hid"] = {"objectID": "hid"}

    sync = _mod(FakeAlgoliaIndex(), monkeypatch)
    # AlgoliaSync deletes rejected/hidden on MODIFY; backfill must do the same.
    for item, event_place_id in (
        (_place(place_id="rej", internal_status="rejected"), "rej"),
        (_place(place_id="hid", visibility="hidden"), "hid"),
        (_place(place_id="ok"), "ok"),
    ):
        sync_index = FakeAlgoliaIndex()
        sync_index.objects[event_place_id] = {"objectID": event_place_id}
        monkeypatch.setattr(sync, "_get_index", lambda idx=sync_index: idx)
        sync.handler(
            {
                "Records": [
                    _stream_record("INSERT", new=item, place_id=event_place_id)
                ]
            },
            None,
        )
        if event_place_id == "ok":
            assert event_place_id in sync_index.objects
        else:
            assert event_place_id in sync_index.deleted

    mod = load_backfill()
    # missing place_id cannot live on the hash key; inject via a scan yield
    real_iter = mod.iter_table_scan

    def scan_with_orphan(table_arg, **kwargs):
        yield from real_iter(table_arg, **kwargs)
        yield {"place_name": "no id", "internal_status": "in_review"}

    monkeypatch.setattr(mod, "iter_table_scan", scan_with_orphan)
    summary = mod.run_backfill(index=fake_algolia, table=table)

    assert summary["indexed"] == 1
    assert summary["deleted"] == 2
    assert summary["skipped"] == 1
    assert summary["skipped_reasons"] == {"missing_place_id": 1}
    assert summary["deleted_reasons"]["rejected"] == 1
    assert summary["deleted_reasons"]["hidden"] == 1
    assert "ok" in fake_algolia.objects
    assert "rej" not in fake_algolia.objects
    assert "hid" not in fake_algolia.objects
    assert "rej" in fake_algolia.deleted
    assert "hid" in fake_algolia.deleted


def test_prune_deletes_index_ids_not_in_dynamodb(dynamodb_tables, fake_algolia):
    table = dynamodb_tables.Table("Places_Places")
    _seed(table, _place(place_id="keep"))
    fake_algolia.objects["keep"] = {"objectID": "keep", "place_name": "old"}
    fake_algolia.objects["stale"] = {"objectID": "stale"}
    fake_algolia.objects["also-stale"] = {"objectID": "also-stale"}

    mod = load_backfill()
    without_prune = mod.run_backfill(index=fake_algolia, table=table)
    assert without_prune["pruned"] == 0
    assert "stale" in fake_algolia.objects
    assert "also-stale" in fake_algolia.objects
    assert fake_algolia.objects["keep"]["place_name"] == "Plunge Lab"

    summary = mod.run_backfill(index=fake_algolia, table=table, prune=True)
    assert summary["indexed"] == 1
    assert summary["pruned"] == 2
    assert set(fake_algolia.objects) == {"keep"}
    assert "stale" in fake_algolia.deleted
    assert "also-stale" in fake_algolia.deleted
    assert fake_algolia.browse_calls


def test_limit_stops_after_n_items(dynamodb_tables, fake_algolia):
    table = dynamodb_tables.Table("Places_Places")
    _seed(table, *[_place(place_id=f"p{i}") for i in range(4)])
    mod = load_backfill()
    summary = mod.run_backfill(index=fake_algolia, table=table, limit=2)
    assert summary["scanned"] == 2
    assert summary["indexed"] == 2
    assert len(fake_algolia.objects) == 2


def test_upsert_batches(dynamodb_tables, fake_algolia):
    table = dynamodb_tables.Table("Places_Places")
    _seed(table, *[_place(place_id=f"p{i}") for i in range(5)])
    mod = load_backfill()
    summary = mod.run_backfill(
        index=fake_algolia, table=table, upsert_batch_size=2
    )
    assert summary["indexed"] == 5
    assert len(fake_algolia.save_calls) == 3
    assert [len(c) for c in fake_algolia.save_calls] == [2, 2, 1]


def test_classify_empty_and_hidden_rejected():
    mod = load_backfill()
    action, details = mod.classify_item(None)
    assert action == "skip"
    assert details["reason"] == "empty_item"

    action, details = mod.classify_item(_place(internal_status="rejected"))
    assert action == "delete"
    assert details["reason"] == "rejected"

    action, details = mod.classify_item(_place(visibility="hidden"))
    assert action == "delete"
    assert details["reason"] == "hidden"

    action, details = mod.classify_item(_place())
    assert action == "index"
    assert details["object"]["objectID"] == "p1"
    assert details["object"]["_geoloc"]["lat"] == 40.7608
