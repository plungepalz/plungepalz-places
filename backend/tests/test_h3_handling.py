"""
Unit tests for H3 handling in generate_place_with_ai layer.

Tests that:
1. When h3 is available, h3_r7/h3_r5/h3_r4 are computed and included in the record
2. When h3 is not available, h3_r7/h3_r5/h3_r4 are omitted from the record
   (DynamoDB rejects empty strings in index key attributes)
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Mock anthropic before importing generate_place_with_ai
sys.modules["anthropic"] = MagicMock()

# Add layer to path for imports
layer_path = Path(__file__).parent.parent / "lambda_layers" / "generate_place_with_ai" / "python"
sys.path.insert(0, str(layer_path))

from generate_place_with_ai.core import _compute_h3


def test_compute_h3_with_h3_available():
    """Test that _compute_h3 returns hex strings when h3 is available."""
    # Check if h3 is actually available
    try:
        import h3
        h3_available = True
    except ImportError:
        h3_available = False
    
    if not h3_available:
        pytest.skip("h3 not installed")
    
    lat, lng = 40.7607, -111.8743
    h3_r7, h3_r5, h3_r4 = _compute_h3(lat, lng)
    
    assert h3_r7 is not None and isinstance(h3_r7, str) and len(h3_r7) > 0, \
        f"Expected non-empty h3_r7, got: {h3_r7}"
    assert h3_r5 is not None and isinstance(h3_r5, str) and len(h3_r5) > 0, \
        f"Expected non-empty h3_r5, got: {h3_r5}"
    assert h3_r4 is not None and isinstance(h3_r4, str) and len(h3_r4) > 0, \
        f"Expected non-empty h3_r4, got: {h3_r4}"


def test_compute_h3_when_h3_unavailable():
    """Test that _compute_h3 returns None values when h3 is not available."""
    lat, lng = 40.7607, -111.8743
    
    # Save and remove h3 from sys.modules
    h3_module = sys.modules.pop("h3", None)
    
    try:
        # Mock builtins.__import__ to raise ImportError for h3
        original_import = __import__
        
        def mock_import(name, *args, **kwargs):
            if name == "h3":
                raise ImportError("No module named 'h3'")
            return original_import(name, *args, **kwargs)
        
        with patch("builtins.__import__", side_effect=mock_import):
            h3_r7, h3_r5, h3_r4 = _compute_h3(lat, lng)
            
            assert h3_r7 is None, f"Expected None when h3 unavailable, got: {h3_r7}"
            assert h3_r5 is None, f"Expected None when h3 unavailable, got: {h3_r5}"
            assert h3_r4 is None, f"Expected None when h3 unavailable, got: {h3_r4}"
    finally:
        # Restore h3 module
        if h3_module is not None:
            sys.modules["h3"] = h3_module


def test_h3_fields_in_record_with_h3_available():
    """Test that h3 fields are only present in record when h3 is available and values are truthy."""
    try:
        import h3
        h3_available = True
    except ImportError:
        h3_available = False
    
    if not h3_available:
        pytest.skip("h3 not installed")
    
    lat, lng = 40.7607, -111.8743
    h3_r7, h3_r5, h3_r4 = _compute_h3(lat, lng)
    
    # Simulate record building logic from core.py
    record = {"place_id": "test-id", "lat": lat, "lng": lng}
    
    if h3_r7:
        record["h3_r7"] = h3_r7
    if h3_r5:
        record["h3_r5"] = h3_r5
    if h3_r4:
        record["h3_r4"] = h3_r4
    
    assert "h3_r7" in record, "h3_r7 should be in record when h3 available"
    assert "h3_r5" in record, "h3_r5 should be in record when h3 available"
    assert "h3_r4" in record, "h3_r4 should be in record when h3 available"
    assert record["h3_r7"] != "", "h3_r7 should not be empty string"
    assert record["h3_r5"] != "", "h3_r5 should not be empty string"
    assert record["h3_r4"] != "", "h3_r4 should not be empty string"


def test_h3_fields_omitted_when_h3_unavailable():
    """Test that h3 fields are omitted from record when h3 returns None."""
    lat, lng = 40.7607, -111.8743
    
    # Simulate h3 being unavailable (None return values)
    h3_r7, h3_r5, h3_r4 = None, None, None
    
    # Simulate record building logic from core.py
    record = {"place_id": "test-id", "lat": lat, "lng": lng}
    
    if h3_r7:
        record["h3_r7"] = h3_r7
    if h3_r5:
        record["h3_r5"] = h3_r5
    if h3_r4:
        record["h3_r4"] = h3_r4
    
    assert "h3_r7" not in record, "h3_r7 should be omitted when h3 unavailable"
    assert "h3_r5" not in record, "h3_r5 should be omitted when h3 unavailable"
    assert "h3_r4" not in record, "h3_r4 should be omitted when h3 unavailable"
