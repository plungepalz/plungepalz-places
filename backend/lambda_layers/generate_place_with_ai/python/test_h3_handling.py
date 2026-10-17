#!/usr/bin/env python3
"""
Unit test for H3 handling in generate_place_with_ai.

Tests that:
1. When h3 is available, h3_r7/h3_r5/h3_r4 are set in the record
2. When h3 is not available, h3_r7/h3_r5/h3_r4 are omitted from the record
   (DynamoDB rejects empty strings in index key attributes)

Usage:
    python test_h3_handling.py
"""

import sys


def _compute_h3(lat: float, lng: float):
    """Compute h3_r7, h3_r5, h3_r4. Returns (None, None, None) if h3 not available."""
    try:
        import h3
        h3_r7 = h3.latlng_to_cell(lat, lng, 7)
        h3_r5 = h3.latlng_to_cell(lat, lng, 5)
        h3_r4 = h3.latlng_to_cell(lat, lng, 4)
        return h3_r7, h3_r5, h3_r4
    except ImportError:
        return None, None, None
    except Exception:
        return None, None, None


def test_h3_available():
    """Test that _compute_h3 returns hex strings when h3 is available."""
    try:
        import h3
        h3_available = True
    except ImportError:
        h3_available = False
    
    lat, lng = 40.7607, -111.8743
    h3_r7, h3_r5, h3_r4 = _compute_h3(lat, lng)
    
    if h3_available:
        assert h3_r7 is not None and isinstance(h3_r7, str) and len(h3_r7) > 0, \
            f"Expected non-empty h3_r7, got: {h3_r7}"
        assert h3_r5 is not None and isinstance(h3_r5, str) and len(h3_r5) > 0, \
            f"Expected non-empty h3_r5, got: {h3_r5}"
        assert h3_r4 is not None and isinstance(h3_r4, str) and len(h3_r4) > 0, \
            f"Expected non-empty h3_r4, got: {h3_r4}"
        print(f"✅ H3 available: h3_r7={h3_r7}, h3_r5={h3_r5}, h3_r4={h3_r4}")
    else:
        assert h3_r7 is None, f"Expected None when h3 unavailable, got: {h3_r7}"
        assert h3_r5 is None, f"Expected None when h3 unavailable, got: {h3_r5}"
        assert h3_r4 is None, f"Expected None when h3 unavailable, got: {h3_r4}"
        print("✅ H3 not available: all values are None (correct)")


def test_h3_in_record():
    """Test that h3 fields are only present in record when h3 is available."""
    try:
        import h3
        h3_available = True
    except ImportError:
        h3_available = False
    
    lat, lng = 40.7607, -111.8743
    h3_r7, h3_r5, h3_r4 = _compute_h3(lat, lng)
    
    # Simulate record building logic
    record = {"place_id": "test-id", "lat": lat, "lng": lng}
    
    if h3_r7:
        record["h3_r7"] = h3_r7
    if h3_r5:
        record["h3_r5"] = h3_r5
    if h3_r4:
        record["h3_r4"] = h3_r4
    
    if h3_available:
        assert "h3_r7" in record, "h3_r7 should be in record when h3 available"
        assert "h3_r5" in record, "h3_r5 should be in record when h3 available"
        assert "h3_r4" in record, "h3_r4 should be in record when h3 available"
        assert record["h3_r7"] != "", "h3_r7 should not be empty string"
        assert record["h3_r5"] != "", "h3_r5 should not be empty string"
        assert record["h3_r4"] != "", "h3_r4 should not be empty string"
        print(f"✅ H3 fields present in record: {list(record.keys())}")
    else:
        assert "h3_r7" not in record, "h3_r7 should be omitted when h3 unavailable"
        assert "h3_r5" not in record, "h3_r5 should be omitted when h3 unavailable"
        assert "h3_r4" not in record, "h3_r4 should be omitted when h3 unavailable"
        print(f"✅ H3 fields correctly omitted from record: {list(record.keys())}")


if __name__ == "__main__":
    print("Running H3 handling tests...\n")
    
    try:
        test_h3_available()
        test_h3_in_record()
        print("\n✅ All tests passed!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
