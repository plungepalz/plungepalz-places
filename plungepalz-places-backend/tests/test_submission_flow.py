"""
Integration-style tests for Places_SubmitAIAutofill handler.
All external calls (DynamoDB, generate_place_record) are mocked.
"""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Add functions path for handler import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "functions", "Places_SubmitAIAutofill"))
# Layer must be importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "layers", "generate_place_with_ai", "python"))


def _make_dynamo_mock(get_item_return, sub_only=True):
    """Create a mock DynamoDB resource. If sub_only, Table() always returns sub mock."""
    mock_sub = MagicMock()
    mock_sub.get_item.return_value = get_item_return
    mock_places = MagicMock()
    mock_resource = MagicMock()
    if sub_only:
        mock_resource.Table.return_value = mock_sub
    else:
        mock_resource.Table.side_effect = [mock_sub, mock_places]
    return mock_resource, mock_sub, mock_places


class TestPlacesSubmitAIAutofill(unittest.TestCase):
    """Tests for Places_SubmitAIAutofill Lambda handler."""

    def _handler(self):
        from index import handler
        return handler

    def test_returns_400_when_submission_id_missing(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            handler = self._handler()
            event = {"body": json.dumps({})}
            resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 400)
        body = json.loads(resp["body"])
        self.assertIn("submission_id", body.get("error", "").lower())

    def test_returns_404_when_submission_not_found(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            mock_dynamo, _, _ = _make_dynamo_mock({"Item": None})
            with patch("index.dynamodb", mock_dynamo):
                handler = self._handler()
                event = {"body": json.dumps({"submission_id": "sub-123"})}
                resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 404)

    def test_returns_400_when_verified_false(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            mock_dynamo, _, _ = _make_dynamo_mock({
                "Item": {
                    "submission_id": "sub-123",
                    "verified": False,
                    "original_submission_record_json": {"place_name": "X", "place_type": "business", "activity_types": ["cold_plunge"], "address": "123 Main"},
                }
            })
            with patch("index.dynamodb", mock_dynamo):
                handler = self._handler()
                event = {"body": json.dumps({"submission_id": "sub-123"})}
                resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 400)
        body = json.loads(resp["body"])
        self.assertIn("verified", body.get("error", "").lower())

    def test_returns_409_when_place_id_generated_already_set(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            mock_dynamo, _, _ = _make_dynamo_mock({
                "Item": {"submission_id": "sub-123", "verified": True, "place_id_generated": "place-xyz", "original_submission_record_json": {}},
            })
            with patch("index.dynamodb", mock_dynamo):
                handler = self._handler()
                event = {"body": json.dumps({"submission_id": "sub-123"})}
                resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 409)

    def test_returns_200_on_happy_path(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            mock_dynamo, mock_sub, mock_places = _make_dynamo_mock({
                "Item": {
                    "submission_id": "sub-123",
                    "verified": True,
                    "place_id_generated": "",
                    "original_submission_record_json": {
                        "place_name": "Plunge Lab",
                        "place_type": "business",
                        "activity_types": ["cold_plunge"],
                        "address": "457 E 300 S, Salt Lake City, UT",
                    },
                },
            }, sub_only=False)
            with patch("index.dynamodb", mock_dynamo):
                with patch("index.generate_place_record") as mock_gen:
                    mock_gen.return_value = {
                        "success": True,
                        "record": {
                            "place_id": "pid-123",
                            "place_slug": "plunge-lab-salt-lake-city",
                            "submission_id": "sub-123",
                            "place_name": "Plunge Lab",
                            "place_type": "business",
                            "activity_types": ["cold_plunge"],
                            "description": "A great place",
                            "place_type_metadata": {},
                            "amenities": [],
                            "tags": [],
                            "external_ratings_ai_generated": {},
                            "ts_created": "2025-02-20T12:00:00Z",
                        },
                        "errors": [],
                        "partial": False,
                    }
                    handler = self._handler()
                    event = {"body": json.dumps({"submission_id": "sub-123"})}
                    resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 200)
        body = json.loads(resp["body"])
        self.assertEqual(body["place_id"], "pid-123")
        self.assertEqual(body["place_slug"], "plunge-lab-salt-lake-city")
        self.assertIn("ai_autofill_result", body)

    def test_returns_500_when_generate_place_record_success_false(self):
        with patch.dict(os.environ, {"TABLE_SUBMISSIONS": "Places_Submissions", "TABLE_PLACES": "Places_Places", "GOOGLE_PLACES_API_KEY": "key"}):
            mock_dynamo, _, _ = _make_dynamo_mock({
                "Item": {
                    "submission_id": "sub-123",
                    "verified": True,
                    "place_id_generated": "",
                    "original_submission_record_json": {
                        "place_name": "Plunge Lab",
                        "place_type": "business",
                        "activity_types": ["cold_plunge"],
                        "address": "457 E 300 S, Salt Lake City, UT",
                    },
                },
            })
            with patch("index.dynamodb", mock_dynamo):
                with patch("index.generate_place_record") as mock_gen:
                    mock_gen.return_value = {"success": False, "record": None, "errors": ["AI failed"], "partial": False}
                    handler = self._handler()
                    event = {"body": json.dumps({"submission_id": "sub-123"})}
                    resp = handler(event, None)
        self.assertEqual(resp["statusCode"], 500)
        body = json.loads(resp["body"])
        self.assertIn("error", body)


if __name__ == "__main__":
    unittest.main()
