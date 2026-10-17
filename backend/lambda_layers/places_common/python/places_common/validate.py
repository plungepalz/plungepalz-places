"""Query-string and request-body validation for public endpoints."""

from __future__ import annotations

import math
import re
from typing import Any

from .constants import (
    DEFAULT_RADIUS_KM,
    DEFAULT_SEARCH_LIMIT,
    MAX_ADDRESS_LEN,
    MAX_DESCRIPTION_LEN,
    MAX_PLACE_NAME_LEN,
    MAX_SEARCH_LIMIT,
    MIN_SEARCH_LIMIT,
    VALID_ACTIVITY_TYPES,
    VALID_PLACE_TYPES,
    VALID_REVIEW_DECISIONS,
)
from .http import ValidationError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_INT_RE = re.compile(r"^[+-]?\d+$")


def _query(event: dict | None) -> dict:
    params = (event or {}).get("queryStringParameters")
    return params if isinstance(params, dict) else {}


def _field_error(field: str, message: str, details: dict[str, str]) -> None:
    details[field] = message


def parse_int_param(
    raw: Any,
    field: str,
    default: int | None,
    details: dict[str, str],
    *,
    min_value: int | None = None,
    max_value: int | None = None,
    required: bool = False,
) -> int | None:
    if raw is None or raw == "":
        if required:
            _field_error(field, f"{field} is required", details)
            return None
        return default
    text = str(raw).strip()
    if not _INT_RE.fullmatch(text):
        _field_error(field, f"{field} must be an integer", details)
        return None
    value = int(text)
    if min_value is not None and value < min_value:
        _field_error(field, f"{field} must be >= {min_value}", details)
        return None
    if max_value is not None and value > max_value:
        _field_error(field, f"{field} must be <= {max_value}", details)
        return None
    return value


def parse_float_param(
    raw: Any,
    field: str,
    details: dict[str, str],
    *,
    min_value: float | None = None,
    max_value: float | None = None,
    required: bool = False,
    default: float | None = None,
) -> float | None:
    if raw is None or raw == "":
        if required:
            _field_error(field, f"{field} is required", details)
            return None
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        _field_error(field, f"{field} must be a number", details)
        return None
    if value != value:  # NaN
        _field_error(field, f"{field} must be a finite number", details)
        return None
    if min_value is not None and value < min_value:
        _field_error(field, f"{field} must be >= {min_value}", details)
        return None
    if max_value is not None and value > max_value:
        _field_error(field, f"{field} must be <= {max_value}", details)
        return None
    return value


def parse_bool_param(
    raw: Any,
    field: str,
    details: dict[str, str],
    default: bool = False,
) -> bool:
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text == "true":
        return True
    if text == "false":
        return False
    _field_error(field, f"{field} must be true or false", details)
    return default


def parse_enum_csv(
    raw: Any,
    field: str,
    allowed: frozenset[str],
    details: dict[str, str],
) -> list[str] | None:
    """Parse comma-separated enums. Empty/omitted → None (no filter)."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        tokens = [str(item).strip() for item in raw]
    else:
        tokens = [part.strip() for part in str(raw).split(",")]
    tokens = [t for t in tokens if t]
    if not tokens:
        return None
    unknown = [t for t in tokens if t not in allowed]
    if unknown:
        _field_error(
            field,
            f"Unknown {field} value(s): {', '.join(unknown)}. "
            f"Allowed: {', '.join(sorted(allowed))}",
            details,
        )
        return None
    # Preserve order, drop dupes
    seen: set[str] = set()
    out: list[str] = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _wrap_lng(lng: float) -> float:
    """Wrap longitude into (-180, 180]. 180 folds to -180."""
    wrapped = ((lng + 180.0) % 360.0) - 180.0
    if wrapped == 180.0:
        return -180.0
    return wrapped


def parse_bbox(
    raw: Any, details: dict[str, str]
) -> list[tuple[float, float, float, float]] | None:
    """Parse bbox=minLng,minLat,maxLng,maxLat.

    Clamps lat to ±90. Wraps lng with ((x+180)%360)-180 (Mapbox may send
    unwrapped longitudes past ±180). A raw span of maxLng-minLng >= 360 is
    the whole world. After wrap, minLng > maxLng splits into two Algolia
    insideBoundingBox boxes. 400 only for non-numeric or malformed input.
    """
    if raw is None or raw == "":
        return None
    parts = [p.strip() for p in str(raw).split(",")]
    if len(parts) != 4:
        _field_error(
            "bbox",
            "bbox must be minLng,minLat,maxLng,maxLat (four comma-separated numbers)",
            details,
        )
        return None
    nums: list[float] = []
    for part in parts:
        try:
            nums.append(float(part))
        except ValueError:
            _field_error(
                "bbox",
                "bbox must be minLng,minLat,maxLng,maxLat (four comma-separated numbers)",
                details,
            )
            return None
    if any(not math.isfinite(n) for n in nums):
        _field_error("bbox", "bbox values must be finite numbers", details)
        return None
    min_lng, min_lat, max_lng, max_lat = nums
    min_lat = max(-90.0, min(90.0, min_lat))
    max_lat = max(-90.0, min(90.0, max_lat))
    if min_lat >= max_lat:
        _field_error("bbox", "bbox minLat must be less than maxLat", details)
        return None

    if max_lng - min_lng >= 360.0:
        return [(-180.0, min_lat, 180.0, max_lat)]

    min_lng = _wrap_lng(min_lng)
    max_lng = _wrap_lng(max_lng)

    boxes: list[tuple[float, float, float, float]] = []
    if min_lng > max_lng:
        if min_lng < 180.0:
            boxes.append((min_lng, min_lat, 180.0, max_lat))
        if max_lng > -180.0:
            boxes.append((-180.0, min_lat, max_lng, max_lat))
        boxes = [b for b in boxes if b[0] < b[2]]
        if not boxes:
            _field_error("bbox", "bbox is empty after normalizing", details)
            return None
        return boxes
    if min_lng >= max_lng:
        _field_error("bbox", "bbox minLng must be less than maxLng", details)
        return None
    return [(min_lng, min_lat, max_lng, max_lat)]


def parse_search_params(event: dict | None) -> dict[str, Any]:
    """Validate GET /search query params. Raises ValidationError on any bad param."""
    q = _query(event)
    details: dict[str, str] = {}

    bbox = parse_bbox(q.get("bbox"), details)

    lat_raw = q.get("lat")
    lng_raw = q.get("lng")
    lat_present = lat_raw is not None and str(lat_raw) != ""
    lng_present = lng_raw is not None and str(lng_raw) != ""
    if lat_present != lng_present:
        if lat_present:
            _field_error("lng", "lng is required when lat is provided", details)
        else:
            _field_error("lat", "lat is required when lng is provided", details)

    lat = parse_float_param(lat_raw, "lat", details, min_value=-90, max_value=90) if lat_present else None
    lng = parse_float_param(lng_raw, "lng", details, min_value=-180, max_value=180) if lng_present else None

    radius_raw = q.get("radius_km")
    if radius_raw is not None and str(radius_raw) != "":
        radius_km = parse_float_param(
            radius_raw, "radius_km", details, min_value=0.000001, max_value=20037.5
        )
    else:
        radius_km = DEFAULT_RADIUS_KM

    place_types = parse_enum_csv(q.get("place_type"), "place_type", VALID_PLACE_TYPES, details)
    activity_types = parse_enum_csv(
        q.get("activity_types"), "activity_types", VALID_ACTIVITY_TYPES, details
    )
    approved_only = parse_bool_param(q.get("approved_only"), "approved_only", details, default=False)
    limit = parse_int_param(
        q.get("limit"),
        "limit",
        DEFAULT_SEARCH_LIMIT,
        details,
        min_value=MIN_SEARCH_LIMIT,
        max_value=MAX_SEARCH_LIMIT,
    )
    page = parse_int_param(q.get("page"), "page", 0, details, min_value=0)

    if details:
        raise ValidationError("Invalid request parameters", details)

    query_text = q.get("q")
    if query_text is None:
        query_text = ""
    else:
        query_text = str(query_text)

    # bbox wins over lat/lng/radius when present
    use_bbox = bbox is not None
    return {
        "q": query_text,
        "bbox": bbox,
        "lat": None if use_bbox else lat,
        "lng": None if use_bbox else lng,
        "radius_km": radius_km if not use_bbox else DEFAULT_RADIUS_KM,
        "place_types": place_types,
        "activity_types": activity_types,
        "approved_only": approved_only,
        "limit": limit,
        "page": page,
        "used_bbox": use_bbox,
    }


def _as_number(value: Any, field: str, details: dict[str, str]) -> float | None:
    if value is None or value == "":
        _field_error(field, f"{field} is required", details)
        return None
    if isinstance(value, bool):
        _field_error(field, f"{field} must be a number", details)
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        _field_error(field, f"{field} must be a number", details)
        return None


def validate_submit_body(body: dict) -> dict[str, Any]:
    """Validate POST /submit body. Raises ValidationError with field details."""
    details: dict[str, str] = {}

    place_name = body.get("place_name")
    if not isinstance(place_name, str) or not place_name.strip():
        _field_error("place_name", "place_name is required", details)
        place_name = None
    else:
        place_name = place_name.strip()
        if len(place_name) > MAX_PLACE_NAME_LEN:
            _field_error(
                "place_name",
                f"place_name must be <= {MAX_PLACE_NAME_LEN} characters",
                details,
            )
            place_name = None

    place_type = body.get("place_type")
    if not isinstance(place_type, str) or place_type not in VALID_PLACE_TYPES:
        _field_error(
            "place_type",
            "place_type must be one of: " + ", ".join(sorted(VALID_PLACE_TYPES)),
            details,
        )
        place_type = None

    raw_activities = body.get("activity_types")
    activity_types: list[str] | None = None
    if not isinstance(raw_activities, list) or len(raw_activities) == 0:
        _field_error(
            "activity_types",
            "activity_types must be a non-empty array subset of: cold_plunge, sauna",
            details,
        )
    else:
        cleaned: list[str] = []
        seen: set[str] = set()
        bad = False
        for item in raw_activities:
            if item not in VALID_ACTIVITY_TYPES:
                _field_error(
                    "activity_types",
                    "activity_types must be a non-empty array subset of: cold_plunge, sauna",
                    details,
                )
                bad = True
                break
            if item not in seen:
                seen.add(item)
                cleaned.append(item)
        if not bad:
            if not cleaned:
                _field_error(
                    "activity_types",
                    "activity_types must be a non-empty array subset of: cold_plunge, sauna",
                    details,
                )
            else:
                activity_types = cleaned

    lat = _as_number(body.get("lat"), "lat", details)
    lng = _as_number(body.get("lng"), "lng", details)
    if lat is not None and not (-90 <= lat <= 90):
        _field_error("lat", "lat must be between -90 and 90", details)
        lat = None
    if lng is not None and not (-180 <= lng <= 180):
        _field_error("lng", "lng must be between -180 and 180", details)
        lng = None

    address = body.get("address")
    if address is not None and not isinstance(address, str):
        _field_error("address", "address must be a string", details)
        address = None
    elif isinstance(address, str):
        address = address.strip()
        if address == "":
            address = None
        elif len(address) > MAX_ADDRESS_LEN:
            _field_error(
                "address",
                f"address must be <= {MAX_ADDRESS_LEN} characters",
                details,
            )
            address = None

    if place_type and place_type != "nature" and not address:
        _field_error("address", "address is required unless place_type is nature", details)

    description = body.get("description")
    if description is not None and not isinstance(description, str):
        _field_error("description", "description must be a string", details)
        description = None
    elif isinstance(description, str):
        description = description.strip() or None
        if description is not None and len(description) > MAX_DESCRIPTION_LEN:
            _field_error(
                "description",
                f"description must be <= {MAX_DESCRIPTION_LEN} characters",
                details,
            )
            description = None

    email = body.get("email")
    if email is not None and email != "":
        if not isinstance(email, str) or not _EMAIL_RE.match(email.strip()):
            _field_error("email", "email must be a valid email address", details)
            email = None
        else:
            email = email.strip()
    else:
        email = None

    def _optional_location_field(field: str) -> str | None:
        value = body.get(field)
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            _field_error(field, f"{field} must be a string", details)
            return None
        value = value.strip()
        if not value:
            return None
        if len(value) > MAX_PLACE_NAME_LEN:
            _field_error(
                field,
                f"{field} must be <= {MAX_PLACE_NAME_LEN} characters",
                details,
            )
            return None
        return value

    city = _optional_location_field("city")
    state_province = _optional_location_field("state_province")
    postal_code = _optional_location_field("postal_code")

    if details:
        raise ValidationError("Invalid request body", details)

    result = {
        "place_name": place_name,
        "place_type": place_type,
        "activity_types": activity_types,
        "lat": lat,
        "lng": lng,
        "address": address,
        "description": description,
        "email": email,
    }
    if city:
        result["city"] = city
    if state_province:
        result["state_province"] = state_province
    if postal_code:
        result["postal_code"] = postal_code
    return result


def validate_review_body(body: dict) -> dict[str, Any]:
    details: dict[str, str] = {}
    place_id = body.get("place_id")
    if not isinstance(place_id, str) or not place_id.strip():
        _field_error("place_id", "place_id is required", details)
        place_id = None
    else:
        place_id = place_id.strip()

    decision = body.get("decision")
    if decision not in VALID_REVIEW_DECISIONS:
        _field_error("decision", "decision must be active, rejected, or in_review", details)
        decision = None

    comments = body.get("internal_comments")
    if comments is not None and not isinstance(comments, str):
        _field_error("internal_comments", "internal_comments must be a string", details)
        comments = None
    elif isinstance(comments, str) and comments.strip() == "":
        comments = None

    if details:
        raise ValidationError("Invalid request body", details)

    return {
        "place_id": place_id,
        "decision": decision,
        "internal_comments": comments,
    }
