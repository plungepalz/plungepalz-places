"""fix_city.py: dry-run classification, conditional updates, untouched attrs."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from tests.conftest import BACKEND_ROOT, SAMPLE_PLACE


def _load_fix_mod():
    path = BACKEND_ROOT / "scripts" / "fix_city.py"
    spec = importlib.util.spec_from_file_location("fix_city", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _row(**overrides):
    row = {
        "place_id": SAMPLE_PLACE["place_id"],
        "old_city": "Salt Lake City",
        "new_city": "Helsinki",
        "new_state_province": "Uusimaa",
        "new_postal_code": "00150",
    }
    row.update(overrides)
    return row


def test_city_update_kwargs_only_sets_location_fields():
    mod = _load_fix_mod()
    kwargs = mod.city_update_kwargs(_row())
    expr = kwargs["UpdateExpression"]
    assert expr.startswith("SET city = :new")
    assert "state_province = :sp" in expr
    assert "postal_code = :pc" in expr
    assert "place_slug" not in expr
    assert "internal_status" not in expr
    assert "ts_last_updated" not in expr
    assert kwargs["ConditionExpression"] == "attribute_exists(place_id) AND city = :old"
    assert kwargs["ExpressionAttributeValues"][":old"] == "Salt Lake City"
    assert kwargs["ExpressionAttributeValues"][":new"] == "Helsinki"
    assert kwargs["Key"] == {"place_id": SAMPLE_PLACE["place_id"]}


def test_city_update_kwargs_city_only_when_optional_fields_absent():
    mod = _load_fix_mod()
    kwargs = mod.city_update_kwargs(
        {"place_id": "p1", "old_city": "Old", "new_city": "New"}
    )
    assert kwargs["UpdateExpression"] == "SET city = :new"
    assert set(kwargs["ExpressionAttributeValues"]) == {":new", ":old"}


def test_dry_run_classifies_would_update_already_fixed_mismatch(dynamodb_tables, tmp_path, capsys):
    mod = _load_fix_mod()
    table = dynamodb_tables.Table("Places_Places")
    matching = dict(SAMPLE_PLACE)
    already = dict(SAMPLE_PLACE)
    already["place_id"] = "already-1"
    already["city"] = "Helsinki"
    other = dict(SAMPLE_PLACE)
    other["place_id"] = "other-1"
    other["city"] = "Berlin"
    table.put_item(Item=matching)
    table.put_item(Item=already)
    table.put_item(Item=other)

    fixes = [
        _row(),
        _row(place_id="already-1", old_city="Salt Lake City", new_city="Helsinki"),
        _row(place_id="other-1", old_city="Salt Lake City", new_city="Helsinki"),
        _row(place_id="missing-1", old_city="Salt Lake City", new_city="Helsinki"),
    ]
    path = tmp_path / "fixes.json"
    path.write_text(json.dumps(fixes), encoding="utf-8")

    get_opts = []
    original_get = table.get_item

    def _get(**kwargs):
        get_opts.append(kwargs)
        return original_get(**kwargs)

    table.get_item = _get
    args = mod.build_parser().parse_args(["--from-file", str(path), "--dry-run"])
    assert mod.run(args, table=table) == 0
    assert all(opt.get("ConsistentRead") is True for opt in get_opts)
    summary = json.loads(capsys.readouterr().out)
    assert summary["would_update"] == 1
    assert summary["already_fixed"] == 1
    assert summary["mismatch"] == 2
    assert summary["updated"] == 0
    stored = table.get_item(Key={"place_id": SAMPLE_PLACE["place_id"]})["Item"]
    assert stored["city"] == "Salt Lake City"


def test_live_update_sets_location_only_and_skips_mismatch(dynamodb_tables, tmp_path, capsys):
    mod = _load_fix_mod()
    table = dynamodb_tables.Table("Places_Places")
    item = dict(SAMPLE_PLACE)
    item["internal_status"] = "active"
    item["place_slug"] = "plunge-lab-salt-lake-city"
    item["description"] = "leave me"
    item["ts_last_updated"] = "2026-02-20T12:00:00Z"
    table.put_item(Item=item)
    mismatched = dict(SAMPLE_PLACE)
    mismatched["place_id"] = "mis-1"
    mismatched["city"] = "Berlin"
    table.put_item(Item=mismatched)

    path = tmp_path / "fixes.json"
    path.write_text(
        json.dumps(
            [
                _row(),
                _row(place_id="mis-1", old_city="Salt Lake City", new_city="Helsinki"),
            ]
        ),
        encoding="utf-8",
    )
    args = mod.build_parser().parse_args(["--from-file", str(path), "--table", "Places_Places"])
    assert mod.run(args, table=table) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["updated"] == 1
    assert summary["skipped_mismatch"] == 1

    updated = table.get_item(Key={"place_id": SAMPLE_PLACE["place_id"]})["Item"]
    assert updated["city"] == "Helsinki"
    assert updated["state_province"] == "Uusimaa"
    assert updated["postal_code"] == "00150"
    assert updated["internal_status"] == "active"
    assert updated["place_slug"] == "plunge-lab-salt-lake-city"
    assert updated["description"] == "leave me"
    assert updated["ts_last_updated"] == "2026-02-20T12:00:00Z"

    leftover = table.get_item(Key={"place_id": "mis-1"})["Item"]
    assert leftover["city"] == "Berlin"
    assert "postal_code" not in leftover


def test_limit_and_rejects_zero(tmp_path):
    mod = _load_fix_mod()
    path = tmp_path / "fixes.json"
    path.write_text(
        json.dumps([_row(), _row(place_id="p2"), _row(place_id="p3")]),
        encoding="utf-8",
    )
    parser = mod.build_parser()
    args = parser.parse_args(["--from-file", str(path), "--limit", "2", "--dry-run"])
    assert args.limit == 2
    with pytest.raises(SystemExit):
        parser.parse_args(["--from-file", str(path), "--limit", "0"])


def test_load_fixes_rejects_unknown_fields(tmp_path, capsys):
    mod = _load_fix_mod()
    path = tmp_path / "fixes.json"
    path.write_text(
        json.dumps(
            [
                {
                    "place_id": "p1",
                    "old_city": "Old",
                    "new_city": "New",
                    "new_postcode": "84111",
                }
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match=r"fix entry 0 has unknown field\(s\): new_postcode"):
        mod.load_fixes(path)
    args = mod.build_parser().parse_args(["--from-file", str(path), "--dry-run"])
    assert mod.run(args, table=object()) == 1
    err = json.loads(capsys.readouterr().out)
    assert err["error"]["code"] == "VALIDATION_ERROR"
    assert "new_postcode" in err["error"]["message"]
    assert "fix entry 0" in err["error"]["message"]


def test_script_has_no_hardcoded_credentials():
    source = Path(BACKEND_ROOT / "scripts" / "fix_city.py").read_text(encoding="utf-8")
    assert "AKIA" not in source
    assert "aws_access_key_id" not in source.lower()
    assert "execute-api" not in source
