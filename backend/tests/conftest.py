"""Shared pytest fixtures: layer paths, moto DynamoDB, fake Algolia."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# generate_place_with_ai.core imports anthropic at module load. Tests mock
# HTTP/clients; they do not need the real SDK. test_h3_handling replaces this
# via a monkeypatch fixture before re-importing core.
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()

BACKEND_ROOT = Path(__file__).resolve().parents[1]
COMMON_LAYER = BACKEND_ROOT / "lambda_layers" / "places_common" / "python"
AI_LAYER = BACKEND_ROOT / "lambda_layers" / "generate_place_with_ai" / "python"

sys.path.insert(0, str(COMMON_LAYER))
sys.path.insert(0, str(AI_LAYER))

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("TABLE_PLACES", "Places_Places")
os.environ.setdefault("TABLE_SUBMISSIONS", "Places_Submissions")
os.environ.setdefault("ALGOLIA_APP_ID", "testapp")
os.environ.setdefault("ALGOLIA_SEARCH_API_KEY", "searchkey")
os.environ.setdefault("ALGOLIA_WRITE_API_KEY", "writekey")
os.environ.setdefault("ALGOLIA_INDEX_NAME", "places_dev")
os.environ.setdefault("CORS_ALLOWED_ORIGIN", "*")


def load_handler(lambda_name: str):
    path = BACKEND_ROOT / "lambda_functions" / lambda_name / "index.py"
    module_name = f"lambda_{lambda_name}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


class FakeAlgoliaIndex:
    def __init__(self):
        self.objects: dict[str, dict] = {}
        self.deleted: list[str] = []
        self.searches: list[tuple[str, dict]] = []
        self.search_result = {"hits": [], "nbHits": 0}

    def save_objects(self, objects):
        for obj in objects:
            oid = obj["objectID"]
            self.objects[oid] = obj
        return {"objectIDs": [o["objectID"] for o in objects]}

    def delete_objects(self, object_ids):
        for oid in object_ids:
            self.objects.pop(oid, None)
            self.deleted.append(oid)
        return {"objectIDs": list(object_ids)}

    def search(self, query, opts=None):
        opts = opts or {}
        self.searches.append((query, opts))
        result = dict(self.search_result)
        hits = list(result.get("hits") or [])
        # Simulate Algolia customRanking desc(ts_created_unix) when no geo is applied.
        if "insideBoundingBox" not in opts and "aroundLatLng" not in opts:
            from places_common.records import ts_to_unix

            def _rank(hit):
                unix = hit.get("ts_created_unix")
                if unix is None:
                    unix = ts_to_unix(hit.get("ts_created") or hit.get("created_ts"))
                return unix or 0

            hits = sorted(hits, key=_rank, reverse=True)
            result["hits"] = hits
        return result


@pytest.fixture
def fake_algolia():
    return FakeAlgoliaIndex()


@pytest.fixture
def dynamodb_tables(monkeypatch):
    from moto import mock_aws

    with mock_aws():
        import boto3

        monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
        monkeypatch.setenv("TABLE_PLACES", "Places_Places")
        monkeypatch.setenv("TABLE_SUBMISSIONS", "Places_Submissions")
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName="Places_Places",
            KeySchema=[{"AttributeName": "place_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "place_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="Places_Submissions",
            KeySchema=[{"AttributeName": "submission_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "submission_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield dynamodb


def api_event(*, query=None, body=None, path_parameters=None):
    event = {
        "httpMethod": "GET",
        "queryStringParameters": query,
        "pathParameters": path_parameters,
        "headers": {},
    }
    if body is not None:
        event["httpMethod"] = "POST"
        event["body"] = json.dumps(body) if not isinstance(body, str) else body
    return event


def parse_body(response: dict) -> dict:
    return json.loads(response["body"])


SAMPLE_PLACE = {
    "place_id": "place-active-1",
    "place_slug": "plunge-lab-salt-lake-city",
    "place_name": "Plunge Lab",
    "place_type": "business",
    "visibility": "public",
    "address": "457 E 300 S, Salt Lake City, UT 84111",
    "city": "Salt Lake City",
    "state_province": "UT",
    "country": "USA",
    "activity_types": ["cold_plunge", "sauna"],
    "description": "A studio.",
    "cover_image": None,
    "lat": Decimal("40.7608"),
    "lng": Decimal("-111.8910"),
    "internal_status": "in_review",
    "internal_comments": "staff only",
    "ts_created": "2026-02-20T12:00:00Z",
    "ts_last_updated": "2026-02-20T12:00:00Z",
}
