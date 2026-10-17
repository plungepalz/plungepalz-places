"""
PlungePalz Places API — generate_place_with_ai core implementation.

Uses Google Places New API v1 and Claude to generate structured place records.
Supports two backends:
  - Anthropic API (default): tool_use for structured output; used in Lambda.
  - Claude Agent SDK (USE_CLAUDE_AGENT_SDK=1): query() with WebFetch/WebSearch
    for web-derived data; used for local testing.
Never writes to DynamoDB.
"""

import json
import logging
import os
import re
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

import anthropic

logger = logging.getLogger(__name__)

VALID_PLACE_TYPES = frozenset({"business", "nature", "temporary_pop_up", "gym_amenity"})
VALID_ACTIVITY_TYPES = frozenset({"cold_plunge", "sauna"})
EXPERIENCE_TYPES = frozenset({"Community", "Private Room(s)", "Hybrid"})
ACCESS_TYPE_BUSINESS = frozenset({"pay", "membership", "free"})
ACCESS_TYPE_NATURE = frozenset({"free", "parking_fee"})
ACCESS_TYPE_POP_UP = frozenset({"pay", "free"})
NATURE_TYPES = frozenset({"river", "lake", "creek", "ocean", "pond", "stream", "avanto"})
HIKE_DIFFICULTY = frozenset({"easy", "moderate", "hard", "strenuous"})
RECURRENCE_TYPES = frozenset({"daily", "weekly", "bi-weekly", "monthly", "bi-monthly"})


def _parse_location(place_location: dict, errors: list) -> tuple[str | None, str | None, str | None]:
    """Parse place_location into address, lat, lng. Returns (address, lat, lng)."""
    if not place_location or not isinstance(place_location, dict):
        errors.append("place_location must be a dict with type and value")
        return None, None, None

    loc_type = place_location.get("type")
    value = place_location.get("value")
    if not value or not isinstance(value, str):
        errors.append("place_location.value must be a non-empty string")
        return None, None, None

    if loc_type == "address":
        return value.strip(), None, None

    if loc_type == "coordinates":
        parts = value.strip().split("|")
        if len(parts) != 2:
            errors.append("place_location coordinates format must be '{lng}|{lat}'")
            return None, None, None
        try:
            lng = float(parts[0].strip())
            lat = float(parts[1].strip())
            if not (-180 <= lng <= 180) or not (-90 <= lat <= 90):
                errors.append("Invalid lat/lng bounds")
                return None, None, None
            return None, lat, lng
        except ValueError:
            errors.append("place_location coordinates must be numeric: '{lng}|{lat}'")
            return None, None, None

    errors.append(f"place_location.type must be 'address' or 'coordinates', got: {loc_type}")
    return None, None, None


def _generate_slug(place_name: str, city: str) -> str:
    """Generate place_slug: {place_name}-{city} lowercase, hyphenated."""
    def _slug_part(s: str) -> str:
        if not s:
            return ""
        s = re.sub(r"[^\w\s-]", "", s.lower())
        s = re.sub(r"[-\s]+", "-", s).strip("-")
        return s

    name_part = _slug_part(place_name or "")
    city_part = _slug_part(city or "")
    if not name_part and not city_part:
        return "unknown"
    if not city_part:
        return name_part
    if not name_part:
        return city_part
    return f"{name_part}-{city_part}"


def _extract_city(formatted_address: str) -> str:
    """Extract city from Google formattedAddress (heuristic: often second-to-last comma part)."""
    if not formatted_address:
        return ""
    parts = [p.strip() for p in formatted_address.split(",")]
    if len(parts) >= 2:
        return parts[-2] if len(parts) >= 2 else parts[0]
    return parts[0] if parts else ""


def _extract_state(formatted_address: str) -> str:
    """Extract state/province from Google formattedAddress (e.g. 'UT' from 'UT 84111')."""
    if not formatted_address:
        return ""
    parts = [p.strip() for p in formatted_address.split(",")]
    if len(parts) >= 2:
        last = parts[-1]
        if re.match(r"^[A-Za-z]{2}\s+\d", last):
            return last.split()[0]
        if re.match(r"^\d{5}", last):
            return parts[-2].split()[0] if len(parts) >= 2 else last
        return last
    return ""


def _extract_country(formatted_address: str) -> str:
    """Extract country from Google formattedAddress."""
    if not formatted_address:
        return ""
    parts = [p.strip() for p in formatted_address.split(",")]
    if parts:
        last = parts[-1]
        if re.match(r"^[A-Z]{2}\s+\d", last) or re.match(r"^\d{5}", last):
            return parts[-2] if len(parts) >= 2 else last
        return last
    return ""


def _has_discount(metadata: dict) -> bool:
    """Return True if place has a PlungePalz discount (non-empty string)."""
    if not metadata:
        return False
    discount = metadata.get("plungepalz_discount") or metadata.get("plungepalzDiscount")
    return bool(discount and isinstance(discount, str) and discount.strip())


def _clamp_rating(r: float) -> float:
    """Clamp rating to 1.0–5.0."""
    if r is None:
        return 3.0
    try:
        v = float(r)
        return max(1.0, min(5.0, v))
    except (TypeError, ValueError):
        return 3.0


def _validate_metadata(metadata: dict, place_type: str, errors: list) -> dict:
    """Validate and correct place_type_metadata per place_type. Returns sanitized metadata."""
    if not metadata or not isinstance(metadata, dict):
        return _default_metadata(place_type)

    out = dict(metadata)
    if place_type == "business" or place_type == "gym_amenity":
        exp = (out.get("experience_type") or "").strip()
        if exp not in EXPERIENCE_TYPES:
            out["experience_type"] = "Community"
        access = (out.get("access_type") or "").strip().lower()
        if access not in ACCESS_TYPE_BUSINESS:
            out["access_type"] = "pay"
    elif place_type == "nature":
        access = (out.get("access_type") or "").strip().lower()
        if access not in ACCESS_TYPE_NATURE:
            out["access_type"] = "free"
        nt = (out.get("nature_type") or "").strip().lower()
        if nt not in NATURE_TYPES:
            out["nature_type"] = "lake"
        hi = out.get("hike_info") or {}
        if isinstance(hi, dict) and hi.get("difficulty"):
            d = str(hi["difficulty"]).strip().lower()
            if d not in HIKE_DIFFICULTY:
                hi = dict(hi)
                hi["difficulty"] = "moderate"
                out["hike_info"] = hi
    elif place_type == "temporary_pop_up":
        access = (out.get("access_type") or "").strip().lower()
        if access not in ACCESS_TYPE_POP_UP:
            out["access_type"] = "pay"
        rec = out.get("recurrence") or {}
        if isinstance(rec, dict) and rec.get("type"):
            rt = str(rec["type"]).strip().lower()
            if rt not in RECURRENCE_TYPES:
                rec = dict(rec)
                rec["type"] = "weekly"
                out["recurrence"] = rec

    return out


def _default_metadata(place_type: str) -> dict:
    """Return minimal default metadata for place_type."""
    if place_type == "business" or place_type == "gym_amenity":
        return {"experience_type": "Community", "access_type": "pay"}
    if place_type == "nature":
        return {"access_type": "free", "nature_type": "lake"}
    if place_type == "temporary_pop_up":
        return {"access_type": "pay", "recurrence": {"type": "weekly"}}
    return {}


def _fetch_google_places(
    place_name: str,
    place_location: dict,
    google_places_api_key: str,
    errors: list,
) -> dict | None:
    """Call Google Places New API v1: searchText then place details. Returns place data or None."""
    address, lat, lng = _parse_location(place_location, errors)
    if errors:
        return None

    text_query = place_name
    if address:
        text_query = f"{place_name} {address}"
    elif lat is not None and lng is not None:
        text_query = f"{place_name} {lat},{lng}"

    search_url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_api_key,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,places.location,"
            "places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,"
            "places.formattedPhoneNumber,places.regularOpeningHours,places.businessStatus,"
            "places.googleMapsUri,places.editorialSummary,places.types"
        ),
    }
    body = {"textQuery": text_query, "pageSize": 1}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 5000.0}}

    try:
        req = Request(
            search_url,
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except HTTPError as e:
        errors.append(f"Google Places searchText error: {e.code} {e.reason}")
        return None
    except URLError as e:
        errors.append(f"Google Places request failed: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        errors.append(f"Google Places response JSON error: {e}")
        return None

    places = data.get("places") or []
    if not places:
        loc = {"latitude": lat, "longitude": lng} if lat is not None and lng is not None else {}
        return {
            "formattedAddress": address or "",
            "formatted_address": address or "",
            "place_name": place_name,
            "lat": lat,
            "lng": lng,
            "location": loc,
        }

    place = places[0]
    place_id = place.get("id") or ""
    if not place_id.startswith("places/"):
        place_id = f"places/{place_id}" if place_id else ""

    dn = place.get("displayName")
    es = place.get("editorialSummary")
    google_data = {
        "id": place.get("id"),
        "displayName": dn.get("text") if isinstance(dn, dict) else (dn or ""),
        "formattedAddress": place.get("formattedAddress", address or ""),
        "location": place.get("location"),
        "rating": place.get("rating"),
        "userRatingCount": place.get("userRatingCount"),
        "websiteUri": place.get("websiteUri"),
        "nationalPhoneNumber": place.get("nationalPhoneNumber"),
        "formattedPhoneNumber": place.get("formattedPhoneNumber"),
        "regularOpeningHours": place.get("regularOpeningHours"),
        "businessStatus": place.get("businessStatus"),
        "googleMapsUri": place.get("googleMapsUri"),
        "editorialSummary": es.get("text") if isinstance(es, dict) else (es or ""),
        "types": place.get("types", []),
    }
    return google_data


def _call_claude_api_populate(
    place_name: str,
    place_type: str,
    activity_types: list,
    google_data: dict,
    anthropic_api_key: str,
    model_id: str,
    errors: list,
    max_tokens: int = 1024,
) -> dict | None:
    """Invoke Claude via Anthropic API with tool_use. Returns parsed tool output."""
    if not anthropic_api_key or not anthropic_api_key.strip():
        errors.append("ANTHROPIC_API_KEY not configured")
        return None

    client = anthropic.Anthropic(api_key=anthropic_api_key.strip())

    prompt = (
        f"Generate a structured place listing for a cold plunge/sauna venue.\n\n"
        f"Place name: {place_name}\n"
        f"Place type: {place_type}\n"
        f"Activity types: {activity_types}\n\n"
        f"Google Places data (use where available): {json.dumps(google_data, default=str)}\n\n"
        f"Fill the populate_place_listing tool with: description (2-4 sentences), "
        f"place_type_metadata (per place_type schema), amenities (list), tags (list), "
        f"external_ratings_ai_generated (object with keys like 'google', 'overall', 1.0-5.0)."
    )

    tools = [
        {
            "name": "populate_place_listing",
            "description": "Output structured place listing data for PlungePalz.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "place_type_metadata": {"type": "object"},
                    "amenities": {"type": "array", "items": {"type": "string"}},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "external_ratings_ai_generated": {"type": "object"},
                },
                "required": ["description", "place_type_metadata", "amenities", "tags", "external_ratings_ai_generated"],
            },
        }
    ]

    try:
        response = client.messages.create(
            model=model_id,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
            tools=tools,
            tool_choice={"type": "tool", "name": "populate_place_listing"},
        )
    except Exception as e:
        errors.append(f"Anthropic API error: {e}")
        return None

    content = response.content or []
    for block in content:
        if getattr(block, "type", "") == "tool_use" and getattr(block, "name", "") == "populate_place_listing":
            return block.input if hasattr(block, "input") and block.input else {}
    return None


def _call_claude_agent_sdk_populate(
    place_name: str,
    place_type: str,
    activity_types: list,
    google_data: dict,
    anthropic_api_key: str,
    errors: list,
) -> dict | None:
    """
    Invoke Claude via Agent SDK query() with WebFetch/WebSearch for web-derived data.
    Uses structured output. Requires claude-agent-sdk and ANTHROPIC_API_KEY.
    Best for local testing with web tools.
    """
    try:
        from claude_agent_sdk import query, ClaudeAgentOptions
    except ImportError:
        errors.append("claude-agent-sdk not installed. Run: pip install claude-agent-sdk")
        return None

    if not anthropic_api_key or not anthropic_api_key.strip():
        errors.append("ANTHROPIC_API_KEY not configured")
        return None

    import asyncio

    place_schema = {
        "type": "object",
        "properties": {
            "description": {"type": "string"},
            "place_type_metadata": {"type": "object"},
            "amenities": {"type": "array", "items": {"type": "string"}},
            "tags": {"type": "array", "items": {"type": "string"}},
            "external_ratings_ai_generated": {"type": "object"},
        },
        "required": ["description", "place_type_metadata", "amenities", "tags", "external_ratings_ai_generated"],
    }

    prompt = (
        f"Research this cold plunge/sauna venue and produce a structured listing.\n\n"
        f"Place name: {place_name}\n"
        f"Place type: {place_type}\n"
        f"Activity types: {activity_types}\n\n"
        f"Google Places data (use where available): {json.dumps(google_data, default=str)}\n\n"
        f"Use WebFetch and/or WebSearch to find additional info from the web (website, reviews, amenities). "
        f"Then return JSON with: description (2-4 sentences), place_type_metadata (per place_type schema), "
        f"amenities (list), tags (list), external_ratings_ai_generated (object with 'google', 'overall', etc., 1.0-5.0)."
    )

    api_key = anthropic_api_key.strip()

    async def _run_query():
        options = ClaudeAgentOptions(
            allowed_tools=["WebFetch", "WebSearch"],
            output_format={"type": "json_schema", "schema": place_schema},
            env={"ANTHROPIC_API_KEY": api_key},
        )
        structured = None
        async for message in query(prompt=prompt, options=options):
            if getattr(message, "subtype", None) in ("success", "error") and hasattr(message, "structured_output"):
                structured = message.structured_output
                break
        return structured

    try:
        result = asyncio.run(_run_query())
        return result if isinstance(result, dict) else None
    except Exception as e:
        errors.append(f"Claude Agent SDK error: {e}")
        return None


def _compute_h3(lat: float, lng: float) -> tuple[str | None, str | None, str | None]:
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


def _validate_and_sanitise(
    record: dict,
    google_data: dict,
    place_type: str,
    errors: list,
) -> dict:
    """Validate record, apply Google rating override, clamp ratings."""
    out = dict(record)
    ext_ratings = out.get("external_ratings_ai_generated") or {}
    if not isinstance(ext_ratings, dict):
        ext_ratings = {}
    ext_ratings = dict(ext_ratings)

    google_rating = None
    if google_data and google_data.get("rating") is not None:
        google_rating = _clamp_rating(google_data["rating"])
    if google_rating is not None:
        ext_ratings["google"] = google_rating
    for k, v in ext_ratings.items():
        ext_ratings[k] = _clamp_rating(v)
    out["external_ratings_ai_generated"] = ext_ratings

    meta = out.get("place_type_metadata") or {}
    out["place_type_metadata"] = _validate_metadata(meta, place_type, errors)
    out["has_plungepalz_discount"] = _has_discount(out["place_type_metadata"])
    return out


def generate_place_record(
    place_name: str,
    place_type: str,
    place_location: dict,
    activity_types: list,
    google_places_api_key: str,
    anthropic_api_key: str,
    model_id: str,
    submission_id: str,
    max_tokens: int = 1024,
) -> dict:
    """
    Generate a fully populated Places_Places record using Google Places + Claude (Anthropic API).

    Args:
        place_name: Display name
        place_type: business | nature | temporary_pop_up | gym_amenity
        place_location: { type: "address"|"coordinates", value: "..." }
        activity_types: ["cold_plunge"] and/or ["sauna"]
        google_places_api_key: API key for Google Places
        anthropic_api_key: Anthropic API key for Claude
        model_id: Claude model (e.g. claude-3-5-haiku-latest)
        submission_id: For traceability
        max_tokens: Anthropic max_tokens cap (default 1024; keep low for spend)

    Returns:
        { success: bool, record: dict|None, errors: list, partial: bool }
    """
    errors: list[str] = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if place_type not in VALID_PLACE_TYPES:
        return {"success": False, "record": None, "errors": [f"Invalid place_type: {place_type}"], "partial": False}

    act = [a for a in (activity_types or []) if a in VALID_ACTIVITY_TYPES]
    if not act:
        act = ["cold_plunge"]

    address, lat, lng = _parse_location(place_location, errors)
    if errors:
        return {"success": False, "record": None, "errors": errors, "partial": False}

    google_data = _fetch_google_places(place_name, place_location, google_places_api_key, errors)
    partial = len(errors) > 0
    if not google_data:
        google_data = {}

    loc = google_data.get("location") or {}
    if lat is None and isinstance(loc, dict):
        lat = loc.get("latitude")
        lng = loc.get("longitude")
    if address is None or address == "":
        address = google_data.get("formattedAddress") or ""
    if lat is None:
        lat = 0.0
    if lng is None:
        lng = 0.0

    city = _extract_city(address or google_data.get("formattedAddress", ""))
    state = _extract_state(address or google_data.get("formattedAddress", ""))
    country = _extract_country(address or google_data.get("formattedAddress", ""))

    use_agent_sdk = os.environ.get("USE_CLAUDE_AGENT_SDK", "").strip().lower() in ("1", "true", "yes")
    if use_agent_sdk:
        ai_result = _call_claude_agent_sdk_populate(
            place_name, place_type, act, google_data, anthropic_api_key, errors
        )
    else:
        ai_result = _call_claude_api_populate(
            place_name,
            place_type,
            act,
            google_data,
            anthropic_api_key,
            model_id,
            errors,
            max_tokens=max_tokens,
        )

    if not ai_result:
        if not partial:
            errors.append("Claude API returned no tool output")
        return {"success": False, "record": None, "errors": errors, "partial": partial}

    place_id = str(uuid.uuid4())
    place_slug = _generate_slug(place_name, city)

    record = {
        "place_id": place_id,
        "submission_id": submission_id,
        "lat": Decimal(str(lat)),
        "lng": Decimal(str(lng)),
        "place_name": place_name,
        "place_type": place_type,
        "visibility": "public",
        "place_slug": place_slug,
        "address": address or "",
        "city": city,
        "state_province": state,
        "country": country,
        "activity_types": act,
        "description": ai_result.get("description") or "",
        "place_type_metadata": ai_result.get("place_type_metadata") or {},
        "amenities": ai_result.get("amenities") or [],
        "has_plungepalz_discount": False,
        "place_website_url": google_data.get("websiteUri") or "",
        "use_google_places_api_data": bool(google_data),
        "google_places_api_data": google_data,
        "latest_google_places_refresh": ts if google_data else "",
        "images": [],
        "cover_image": None,
        "header_image": None,
        "internal_status": "in_review",
        "internal_comments": "",
        "internal_verified": False,
        "internal_verified_ts": "",
        "external_reporting": [],
        "total_plunge_sessions_recorded": 0,
        "total_sauna_sessions_recorded": 0,
        "external_ratings_ai_generated": ai_result.get("external_ratings_ai_generated") or {},
        "tags": ai_result.get("tags") or [],
        "ts_created": ts,
        "ts_last_updated": ts,
        "claimed_ts": "",
    }

    h3_r7, h3_r5, h3_r4 = _compute_h3(float(lat), float(lng))
    if h3_r7:
        record["h3_r7"] = h3_r7
    if h3_r5:
        record["h3_r5"] = h3_r5
    if h3_r4:
        record["h3_r4"] = h3_r4

    record = _validate_and_sanitise(record, google_data, place_type, errors)
    record["has_plungepalz_discount"] = _has_discount(record["place_type_metadata"])

    success = len(errors) == 0 or partial
    return {"success": success, "record": record, "errors": errors, "partial": partial}
