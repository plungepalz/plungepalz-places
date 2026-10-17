#!/usr/bin/env python3
"""
Local Lambda invocation — test Lambdas without deploying to AWS.

Usage:
  python scripts/local_invoke.py Places_SubmitAIAutofill Test_001
  python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live
  python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live --agent-sdk

Without --live: mocks DynamoDB and generate_place_with_ai (no API keys needed).
With --live: real Google Places + Anthropic API (mocks DynamoDB).
With --live --agent-sdk: uses Claude Agent SDK query() with WebFetch/WebSearch for web-derived data.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
os.chdir(REPO_ROOT)


def _load_dotenv():
    """Load .env from backend into os.environ (simple parser, no deps)."""
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and v and os.environ.get(k) is None:
                    os.environ[k] = v


_load_dotenv()
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "lambda_layers" / "generate_place_with_ai" / "python"))
sys.path.insert(0, str(REPO_ROOT / "lambda_layers" / "places_common" / "python"))
sys.path.insert(0, str(REPO_ROOT / "lambda_functions" / "Places_SubmitAIAutofill"))


def _load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _build_dynamodb_mock(fixture: dict | None):
    """Build a mock DynamoDB resource that returns fixture for get_item.

    If the fixture is a submission, also synthesizes a Places_Places item so
    the MVP autofill path (enrich existing place) can run locally.
    """
    submission = fixture if fixture and fixture.get("submission_id") else None
    original = (submission or {}).get("original_submission_record_json") or {}
    place = None
    if submission:
        place_id = submission.get("place_id_generated") or "mock-place-id-0001"
        place = {
            "place_id": place_id,
            "submission_id": submission.get("submission_id"),
            "place_name": original.get("place_name") or "Mock Place",
            "place_type": original.get("place_type") or "business",
            "place_slug": "mock-place",
            "visibility": "public",
            "internal_status": "in_review",
            "activity_types": original.get("activity_types") or ["cold_plunge"],
            "address": original.get("address"),
            "lat": original.get("lat") or original.get("latitude"),
            "lng": original.get("lng") or original.get("longitude"),
            "description": original.get("description") or "",
        }

    def _table(name):
        mock_table = MagicMock()
        if name == os.environ.get("TABLE_SUBMISSIONS", "Places_Submissions"):
            mock_table.get_item.return_value = {"Item": submission} if submission else {}
        else:
            mock_table.get_item.return_value = {"Item": place} if place else (
                {"Item": fixture} if fixture else {}
            )
        mock_table.put_item.return_value = None
        mock_table.update_item.return_value = None
        return mock_table

    mock_dynamo = MagicMock()
    mock_dynamo.Table.side_effect = _table
    return mock_dynamo


def _build_mock_generate_place_record():
    """Canned success response for generate_place_record."""
    from decimal import Decimal

    return {
        "success": True,
        "record": {
            "place_id": "mock-place-id-0001",
            "place_slug": "cold-plunge-coffee-salt-lake-city",
            "submission_id": "sub_test_business_001",
            "h3_r7": "8729abc",
            "h3_r5": "8529abc",
            "h3_r4": "8429abc",
            "lat": Decimal("40.7607"),
            "lng": Decimal("-111.8743"),
            "place_name": "Cold Plunge Coffee",
            "place_type": "business",
            "visibility": "public",
            "address": "457 E 300 S, Suite D, Salt Lake City, UT 84111",
            "city": "Salt Lake City",
            "state_province": "UT",
            "country": "US",
            "activity_types": ["cold_plunge", "sauna"],
            "description": "Mock description for local testing.",
            "place_type_metadata": {},
            "amenities": [],
            "tags": [],
            "external_ratings_ai_generated": {},
            "ts_created": "2026-02-25T12:00:00Z",
            "ts_last_updated": "2026-02-25T12:00:00Z",
        },
        "errors": [],
        "partial": False,
    }


def invoke_places_submit_ai_autofill(
    test_dir: Path, use_live: bool, use_agent_sdk: bool, fixture: dict | None
):
    """Invoke Places_SubmitAIAutofill with mocks."""
    event_path = test_dir / "event.json"
    if not event_path.exists():
        print(f"Error: {event_path} not found")
        sys.exit(1)

    event = _load_json(event_path)
    mock_dynamo = _build_dynamodb_mock(fixture)

    env = {
        "TABLE_SUBMISSIONS": "Places_Submissions",
        "TABLE_PLACES": "Places_Places",
        "GOOGLE_PLACES_API_KEY": (
            "mock-key" if not use_live else os.environ.get("GOOGLE_PLACES_API_KEY", "")
        ),
        "ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY": (
            "mock-key" if not use_live else os.environ.get("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "")
        ),
        "ANTHROPIC_MODEL": os.environ.get(
            "ANTHROPIC_MODEL",
            os.environ.get("ANTHROPIC_MODEL_ID", "claude-haiku-4-5-20251001"),
        ),
        "USE_CLAUDE_AGENT_SDK": "1" if use_agent_sdk else "0",
    }

    mock_result = _build_mock_generate_place_record()

    with patch.dict(os.environ, env, clear=False), patch(
        "boto3.resource", return_value=mock_dynamo
    ):
        from index import handler

        class Ctx:
            function_name = "Places_SubmitAIAutofill"
            aws_request_id = "local-invoke"

        if use_live:
            response = handler(event, Ctx())
        else:
            with patch("index.generate_place_record", return_value=mock_result):
                response = handler(event, Ctx())

    return response


def main():
    parser = argparse.ArgumentParser(
        description="Invoke Lambda locally with mocked AWS services"
    )
    parser.add_argument(
        "lambda_name",
        help="Lambda function name (e.g. Places_SubmitAIAutofill)",
    )
    parser.add_argument(
        "test_folder",
        help="Test folder name (e.g. Test_001)",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Use real Google Places + Anthropic Claude API (still mocks DynamoDB)",
    )
    parser.add_argument(
        "--agent-sdk",
        action="store_true",
        help="With --live: use Claude Agent SDK query() with WebFetch/WebSearch (requires claude-agent-sdk)",
    )
    args = parser.parse_args()

    test_dir = REPO_ROOT / "tests" / args.lambda_name / args.test_folder
    if not test_dir.exists():
        print(f"Error: {test_dir} not found")
        sys.exit(1)

    fixture_path = test_dir / "dynamodb_fixture.json"
    fixture = _load_json(fixture_path) if fixture_path.exists() else None

    if args.lambda_name == "Places_SubmitAIAutofill":
        response = invoke_places_submit_ai_autofill(
            test_dir, args.live, args.agent_sdk, fixture
        )
    else:
        print(f"Error: Lambda '{args.lambda_name}' not yet supported by local_invoke")
        sys.exit(1)

    print("--- Response ---")
    print(json.dumps(response, indent=2, default=str))
    if "body" in response and isinstance(response["body"], str):
        try:
            body = json.loads(response["body"])
            print("\n--- Parsed body ---")
            print(json.dumps(body, indent=2, default=str))
        except json.JSONDecodeError:
            pass


if __name__ == "__main__":
    main()
