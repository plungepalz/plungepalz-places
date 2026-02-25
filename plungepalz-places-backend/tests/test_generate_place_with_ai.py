"""
Unit tests for generate_place_with_ai layer.
Uses unittest.mock to stub boto3 and urllib.
"""

import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

# Ensure layer is on path (when running from repo root)
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "layers", "generate_place_with_ai", "python"))

from generate_place_with_ai.core import (
    _parse_location,
    _generate_slug,
    _extract_city,
    _extract_state,
    _extract_country,
    _validate_metadata,
    _has_discount,
    _validate_and_sanitise,
    generate_place_record,
)


class TestParseLocation(unittest.TestCase):
    """Tests for _parse_location."""

    def test_address_type_returns_address_none_lat_lng(self):
        errors = []
        addr, lat, lng = _parse_location({"type": "address", "value": "457 E 300 S, Salt Lake City, UT"}, errors)
        self.assertEqual(addr, "457 E 300 S, Salt Lake City, UT")
        self.assertIsNone(lat)
        self.assertIsNone(lng)
        self.assertEqual(errors, [])

    def test_coordinates_type_returns_lat_lng_none_address(self):
        errors = []
        addr, lat, lng = _parse_location({"type": "coordinates", "value": "-111.891|40.7608"}, errors)
        self.assertIsNone(addr)
        self.assertAlmostEqual(lat, 40.7608)
        self.assertAlmostEqual(lng, -111.891)
        self.assertEqual(errors, [])

    def test_malformed_coordinates_adds_to_errors(self):
        errors = []
        addr, lat, lng = _parse_location({"type": "coordinates", "value": "bad|data"}, errors)
        self.assertIn("coordinates must be numeric", errors[0])
        self.assertEqual(len(errors), 1)

    def test_coordinates_single_part_adds_to_errors(self):
        errors = []
        _parse_location({"type": "coordinates", "value": "40.7608"}, errors)
        self.assertIn("coordinates format must be", errors[0])

    def test_invalid_type_adds_to_errors(self):
        errors = []
        _parse_location({"type": "invalid", "value": "x"}, errors)
        self.assertIn("address", errors[0].lower() or "coordinates" in errors[0].lower())

    def test_missing_value_adds_to_errors(self):
        errors = []
        _parse_location({"type": "address", "value": ""}, errors)
        self.assertTrue(len(errors) > 0)


class TestGenerateSlug(unittest.TestCase):
    """Tests for _generate_slug."""

    def test_produces_hyphenated_lowercase(self):
        slug = _generate_slug("Plunge Lab", "Salt Lake City")
        self.assertEqual(slug, "plunge-lab-salt-lake-city")

    def test_empty_city_returns_name_only(self):
        slug = _generate_slug("Test Place", "")
        self.assertEqual(slug, "test-place")


class TestExtractCityStateCountry(unittest.TestCase):
    """Tests for _extract_city, _extract_state, _extract_country."""

    def test_extract_city_from_formatted_address(self):
        addr = "457 E 300 S, Salt Lake City, UT 84111"
        self.assertEqual(_extract_city(addr), "Salt Lake City")

    def test_extract_state_from_formatted_address(self):
        addr = "457 E 300 S, Salt Lake City, UT 84111"
        state = _extract_state(addr)
        self.assertEqual(state, "UT")

    def test_extract_country_from_formatted_address(self):
        addr = "123 Main St, City, UT 84111, USA"
        country = _extract_country(addr)
        self.assertTrue(len(country) > 0)


class TestValidateMetadata(unittest.TestCase):
    """Tests for _validate_metadata."""

    def test_corrects_invalid_experience_type_to_community(self):
        errors = []
        meta = _validate_metadata({"experience_type": "Invalid"}, "business", errors)
        self.assertEqual(meta.get("experience_type"), "Community")

    def test_corrects_invalid_access_type_to_pay(self):
        errors = []
        meta = _validate_metadata({"access_type": "invalid"}, "business", errors)
        self.assertEqual(meta.get("access_type"), "pay")

    def test_corrects_invalid_nature_type_to_lake(self):
        errors = []
        meta = _validate_metadata({"nature_type": "invalid"}, "nature", errors)
        self.assertEqual(meta.get("nature_type"), "lake")

    def test_corrects_invalid_recurrence_type_to_weekly(self):
        errors = []
        meta = _validate_metadata({"recurrence": {"type": "invalid"}}, "temporary_pop_up", errors)
        self.assertEqual(meta.get("recurrence", {}).get("type"), "weekly")


class TestHasDiscount(unittest.TestCase):
    """Tests for _has_discount."""

    def test_returns_true_for_non_empty_string(self):
        self.assertTrue(_has_discount({"plungepalz_discount": "10% off"}))

    def test_returns_false_for_empty_string(self):
        self.assertFalse(_has_discount({"plungepalz_discount": ""}))

    def test_returns_false_for_missing(self):
        self.assertFalse(_has_discount({}))


class TestValidateAndSanitise(unittest.TestCase):
    """Tests for _validate_and_sanitise."""

    def test_google_rating_overwrites_claude_rating(self):
        record = {"external_ratings_ai_generated": {"google": 3.0, "overall": 4.0}}
        google_data = {"rating": 4.8}
        errors = []
        out = _validate_and_sanitise(record, google_data, "business", errors)
        self.assertEqual(out["external_ratings_ai_generated"].get("google"), 4.8)


class TestGeneratePlaceRecord(unittest.TestCase):
    """Tests for generate_place_record."""

    def test_returns_success_false_when_place_type_invalid(self):
        with patch("generate_place_with_ai.core._parse_location") as mock_parse:
            mock_parse.return_value = ("addr", None, None)
            result = generate_place_record(
                place_name="Test",
                place_type="invalid_type",
                place_location={"type": "address", "value": "123 Main"},
                activity_types=["cold_plunge"],
                google_places_api_key="key",
                bedrock_region="us-east-1",
                bedrock_model_id="model",
                submission_id="sub-1",
            )
        self.assertFalse(result["success"])
        self.assertIn("Invalid place_type", result["errors"][0])

    def test_returns_success_false_when_place_location_malformed(self):
        result = generate_place_record(
            place_name="Test",
            place_type="business",
            place_location={"type": "coordinates", "value": "not-valid"},
            activity_types=["cold_plunge"],
            google_places_api_key="key",
            bedrock_region="us-east-1",
            bedrock_model_id="model",
            submission_id="sub-1",
        )
        self.assertFalse(result["success"])
        self.assertTrue(len(result["errors"]) > 0)


if __name__ == "__main__":
    unittest.main()
