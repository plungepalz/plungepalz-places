"""
H3 handling tests for generate_place_with_ai.

Calls the real generate_place_record() with Google Places HTTP and the
Anthropic client mocked. Asserts h3_r* fields are present when h3 is
available and absent when h3 import fails.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock
from urllib.request import Request

import pytest

AI_LAYER = Path(__file__).resolve().parents[1] / "lambda_layers" / "generate_place_with_ai" / "python"


@pytest.fixture
def core_mod(monkeypatch):
    """Import generate_place_with_ai.core with anthropic mocked (no import-time hack)."""
    monkeypatch.syspath_prepend(str(AI_LAYER))
    mock_anthropic = MagicMock()
    monkeypatch.setitem(sys.modules, "anthropic", mock_anthropic)
    for name in list(sys.modules):
        if name == "generate_place_with_ai" or name.startswith("generate_place_with_ai."):
            del sys.modules[name]
    import generate_place_with_ai.core as core

    return core


class _FakeHTTPResponse:
    def __init__(self, payload: dict, status: int = 200):
        self._raw = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


GOOGLE_PAYLOAD = {
    "places": [
        {
            "id": "ChIJtest",
            "displayName": {"text": "Plunge Lab"},
            "formattedAddress": "457 E 300 S, Salt Lake City, UT 84111, USA",
            "location": {"latitude": 40.7607, "longitude": -111.8743},
            "rating": 4.7,
            "userRatingCount": 94,
            "websiteUri": "https://plungelab.com",
            "nationalPhoneNumber": "+18015551212",
            "types": ["spa"],
        }
    ]
}

AI_TOOL_INPUT = {
    "description": "A dedicated cold plunge and sauna studio.",
    "place_type_metadata": {"experience_type": "Hybrid", "access_type": "pay"},
    "amenities": ["lockers", "towels"],
    "tags": ["downtown", "studio"],
    "external_ratings_ai_generated": {"google": {"rating_score": 4.7}},
}


def _install_google_and_anthropic_mocks(core_mod, monkeypatch):
    def fake_urlopen(req, timeout=15):
        assert isinstance(req, Request) or hasattr(req, "full_url") or hasattr(req, "data")
        return _FakeHTTPResponse(GOOGLE_PAYLOAD)

    monkeypatch.setattr(core_mod, "urlopen", fake_urlopen)

    block = MagicMock()
    block.type = "tool_use"
    block.name = "populate_place_listing"
    block.input = AI_TOOL_INPUT
    response = MagicMock()
    response.content = [block]
    client = MagicMock()
    client.messages.create.return_value = response
    core_mod.anthropic.Anthropic.return_value = client
    return client


def _call_generate(core_mod):
    return core_mod.generate_place_record(
        place_name="Plunge Lab",
        place_type="business",
        place_location={"type": "address", "value": "457 E 300 S, Salt Lake City, UT 84111"},
        activity_types=["cold_plunge", "sauna"],
        google_places_api_key="test-google-key",
        anthropic_api_key="test-anthropic-key",
        model_id="claude-haiku-4-5-20251001",
        submission_id="sub_test",
        max_tokens=256,
    )


def test_compute_h3_with_h3_available(core_mod):
    import h3  # noqa: F401 — required by requirements-dev.txt; must not skip

    h3_r7, h3_r5, h3_r4 = core_mod._compute_h3(40.7607, -111.8743)
    assert h3_r7 and isinstance(h3_r7, str)
    assert h3_r5 and isinstance(h3_r5, str)
    assert h3_r4 and isinstance(h3_r4, str)


def test_compute_h3_when_h3_unavailable(core_mod, monkeypatch):
    original_import = __import__

    def mock_import(name, *args, **kwargs):
        if name == "h3":
            raise ImportError("No module named 'h3'")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", mock_import)
    h3_r7, h3_r5, h3_r4 = core_mod._compute_h3(40.7607, -111.8743)
    assert h3_r7 is None
    assert h3_r5 is None
    assert h3_r4 is None


def test_h3_fields_in_record_with_h3_available(core_mod, monkeypatch):
    import h3  # noqa: F401

    client = _install_google_and_anthropic_mocks(core_mod, monkeypatch)
    result = _call_generate(core_mod)

    assert result["success"] is True
    record = result["record"]
    assert record is not None
    assert "h3_r7" in record and record["h3_r7"]
    assert "h3_r5" in record and record["h3_r5"]
    assert "h3_r4" in record and record["h3_r4"]
    assert record["h3_r7"] != ""
    assert record["h3_r5"] != ""
    assert record["h3_r4"] != ""
    client.messages.create.assert_called_once()
    kwargs = client.messages.create.call_args.kwargs
    assert kwargs["max_tokens"] == 256


def test_h3_fields_omitted_when_h3_unavailable(core_mod, monkeypatch):
    _install_google_and_anthropic_mocks(core_mod, monkeypatch)

    original_import = __import__

    def mock_import(name, *args, **kwargs):
        if name == "h3":
            raise ImportError("No module named 'h3'")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", mock_import)
    result = _call_generate(core_mod)

    assert result["success"] is True
    record = result["record"]
    assert record is not None
    assert "h3_r7" not in record
    assert "h3_r5" not in record
    assert "h3_r4" not in record
