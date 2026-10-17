"""Record mapping, sanitizing, slug/h3 helpers, and DynamoDB (de)serialization.

No DynamoDB I/O — serializers only.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from .constants import (
    PLACE_DETAIL_FIELDS,
    PLACE_SUMMARY_FIELDS,
    REVIEW_REVERT_REMOVE_ATTRS,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ts_to_unix(ts: str | None) -> int | None:
    """ISO-8601 UTC timestamp → unix seconds for Algolia customRanking."""
    if not ts or not isinstance(ts, str):
        return None
    text = ts.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def new_place_id() -> str:
    return str(uuid.uuid4())


def new_submission_id() -> str:
    return "sub_" + str(uuid.uuid4())


def is_approved(item: dict | None) -> bool:
    if not item:
        return False
    if "internal_status" in item:
        return item.get("internal_status") == "active"
    return bool(item.get("is_approved"))


def omit_empty_strings(obj: Any) -> Any:
    """Drop empty-string values recursively. DynamoDB rejects empty strings on keys."""
    if isinstance(obj, dict):
        out = {}
        for key, value in obj.items():
            if value == "":
                continue
            out[key] = omit_empty_strings(value)
        return out
    if isinstance(obj, list):
        return [omit_empty_strings(v) for v in obj]
    return obj


def floats_to_decimal(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimal(v) for v in obj]
    if isinstance(obj, bool) or obj is None:
        return obj
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, int) and not isinstance(obj, bool):
        return obj
    return obj


def to_jsonable(obj: Any) -> Any:
    """Convert Decimal / DynamoDB types to JSON-native values."""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, set):
        return [to_jsonable(v) for v in obj]
    return obj


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, dict) and "lat" in value and "lng" in value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _hours_of_operation(item: dict) -> Any:
    """Top-level API field. DATA_SCHEMAS stores this under place_type_metadata, not on Places_Places."""
    top = item.get("hours_of_operation")
    if top not in (None, ""):
        return to_jsonable(top)
    meta = item.get("place_type_metadata")
    if isinstance(meta, dict):
        nested = meta.get("hours_of_operation")
        if nested not in (None, ""):
            return to_jsonable(nested)
    return None


def place_summary(item: dict) -> dict:
    """Map a DynamoDB or Algolia record to the PlaceSummary contract.

    ts_created is the schema name (ISO 8601 UTC). Legacy Algolia `created_ts`
    is accepted as a fallback when reading. lat/lng Decimal → number.
    is_approved ← (internal_status == "active").
    """
    geoloc = item.get("_geoloc") if isinstance(item.get("_geoloc"), dict) else {}
    lat = _to_float(item.get("lat"))
    lng = _to_float(item.get("lng"))
    if lat is None:
        lat = _to_float(geoloc.get("lat"))
    if lng is None:
        lng = _to_float(geoloc.get("lng"))

    created = item.get("ts_created") or item.get("created_ts")
    cover = item.get("cover_image")
    if cover == "":
        cover = None

    activity_types = item.get("activity_types") or []
    if isinstance(activity_types, str):
        activity_types = [a.strip() for a in activity_types.split(",") if a.strip()]

    summary = {
        "place_id": item.get("place_id") or item.get("objectID"),
        "place_slug": item.get("place_slug"),
        "place_name": item.get("place_name"),
        "place_type": item.get("place_type"),
        "address": item.get("address"),
        "city": item.get("city"),
        "state_province": item.get("state_province"),
        "country": item.get("country"),
        "activity_types": activity_types,
        "description": item.get("description"),
        "cover_image": cover if cover is not None else None,
        "lat": lat,
        "lng": lng,
        "is_approved": is_approved(item),
        "ts_created": created,
    }
    return {key: summary.get(key) for key in PLACE_SUMMARY_FIELDS}


def place_detail(item: dict) -> dict:
    """GET /place/{id}: explicit allowlist (PlaceSummary + extra public fields).

    Anything not listed — including all internal_* and h3/submission keys — is omitted.
    """
    summary = place_summary(item)
    meta = item.get("place_type_metadata")
    if not isinstance(meta, dict):
        meta = {}
    ratings = item.get("external_ratings_ai_generated")
    if not isinstance(ratings, dict):
        ratings = {}
    website = item.get("place_website_url")
    if website == "":
        website = None
    detail = {
        **summary,
        "place_website_url": website,
        "amenities": to_jsonable(item.get("amenities") or []),
        "tags": to_jsonable(item.get("tags") or []),
        "place_type_metadata": to_jsonable(meta),
        "external_ratings_ai_generated": to_jsonable(ratings),
        "hours_of_operation": _hours_of_operation(item),
        "ts_last_updated": item.get("ts_last_updated"),
    }
    return {key: detail.get(key) for key in PLACE_DETAIL_FIELDS}


def public_place(item: dict) -> dict:
    """Alias for place_detail (allowlisted GET /place/{id} payload)."""
    return place_detail(item)


def _slug_suffix_from_place_id(place_id: str | None) -> str:
    if not place_id or not isinstance(place_id, str):
        return ""
    compact = re.sub(r"[^a-zA-Z0-9]", "", place_id).lower()
    return compact[-8:] if compact else ""


def generate_place_slug(
    place_name: str,
    city: str | None = None,
    place_id: str | None = None,
) -> str:
    """{name}-{city}-{place_id_suffix} so the same name + city do not collide."""

    def _slug_part(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r"[^\w\s-]", "", text.lower())
        text = re.sub(r"[-\s]+", "-", text).strip("-")
        return text

    name_part = _slug_part(place_name or "")
    city_part = _slug_part(city or "")
    if not name_part and not city_part:
        base = "unknown"
    elif not city_part:
        base = name_part
    elif not name_part:
        base = city_part
    else:
        base = f"{name_part}-{city_part}"
    suffix = _slug_suffix_from_place_id(place_id)
    if suffix:
        return f"{base}-{suffix}"
    return base


def parse_address_parts(address: str | None) -> dict[str, str]:
    """Best-effort city / state_province / country from a street address."""
    if not address or not isinstance(address, str):
        return {}
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if not parts:
        return {}
    out: dict[str, str] = {}
    if len(parts) == 1:
        return out

    last = parts[-1]
    # "USA" / "United States" / "US"
    if re.fullmatch(r"[A-Za-z][A-Za-z\s.]{1,}", last) and not re.search(r"\d", last):
        out["country"] = last
        rest = parts[:-1]
    else:
        rest = parts
        out["country"] = "US"

    if not rest:
        return out

    region = rest[-1]
    # "UT 84111" or "UT"
    state_zip = re.match(r"^([A-Za-z]{2})(?:\s+\d[\d-]*)?$", region)
    if state_zip:
        out["state_province"] = state_zip.group(1).upper()
        if len(rest) >= 2:
            out["city"] = rest[-2]
    else:
        out["city"] = region
        if len(rest) >= 2:
            maybe_state = rest[-2]
            m = re.match(r"^([A-Za-z]{2})$", maybe_state)
            if m:
                out["state_province"] = m.group(1).upper()
    return {k: v for k, v in out.items() if v}


def compute_h3(lat: float, lng: float) -> dict[str, str]:
    """Return {h3_r7,h3_r5,h3_r4} when the h3 lib is available; otherwise {}."""
    try:
        import h3

        return {
            "h3_r7": h3.latlng_to_cell(lat, lng, 7),
            "h3_r5": h3.latlng_to_cell(lat, lng, 5),
            "h3_r4": h3.latlng_to_cell(lat, lng, 4),
        }
    except ImportError:
        return {}
    except Exception:
        return {}


def prepare_item(item: dict) -> dict:
    """Python item for DynamoDB resource APIs / resource.meta.client transact writes.

    Converts floats to Decimal and drops empty strings. Do not TypeSerialize
    first — dynamodb.meta.client already runs boto3's attribute transformer.
    """
    return omit_empty_strings(floats_to_decimal(item))


def serialize_item(item: dict) -> dict:
    """Python dict → DynamoDB JSON attribute map (low-level client only)."""
    from boto3.dynamodb.types import TypeSerializer

    serializer = TypeSerializer()
    cleaned = prepare_item(item)
    return {key: serializer.serialize(value) for key, value in cleaned.items()}


_DDB_TYPES = frozenset({"S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"})


def _looks_like_ddb_image(image: dict) -> bool:
    if not image:
        return False
    sample = next(iter(image.values()))
    return isinstance(sample, dict) and bool(sample) and set(sample.keys()) <= _DDB_TYPES


def deserialize_stream_image(image: dict | None) -> dict:
    """Unmarshal a DynamoDB Streams NewImage/OldImage, or pass through a plain dict."""
    if not image:
        return {}
    if not _looks_like_ddb_image(image):
        return dict(image)
    from boto3.dynamodb.types import TypeDeserializer

    deserializer = TypeDeserializer()
    return {key: deserializer.deserialize(value) for key, value in image.items()}


def algolia_object_from_place(place: dict) -> dict:
    """Build the Algolia record: PlaceSummary fields + filter attrs + _geoloc."""
    lat = _to_float(place.get("lat"))
    lng = _to_float(place.get("lng"))
    summary = place_summary(place)
    obj: dict[str, Any] = {
        "objectID": place.get("place_id") or summary.get("place_id"),
        "place_id": summary.get("place_id"),
        "place_slug": summary.get("place_slug"),
        "place_name": summary.get("place_name"),
        "place_type": summary.get("place_type"),
        "address": summary.get("address"),
        "city": summary.get("city"),
        "state_province": summary.get("state_province"),
        "country": summary.get("country"),
        "activity_types": summary.get("activity_types") or [],
        "description": summary.get("description"),
        "cover_image": summary.get("cover_image"),
        "lat": lat,
        "lng": lng,
        "is_approved": is_approved(place),
        "ts_created": summary.get("ts_created") or place.get("ts_created"),
        "internal_status": place.get("internal_status"),
        "visibility": place.get("visibility") or "public",
    }
    unix = ts_to_unix(obj.get("ts_created"))
    if unix is not None:
        obj["ts_created_unix"] = unix
    if lat is not None and lng is not None:
        obj["_geoloc"] = {"lat": lat, "lng": lng}
    return omit_empty_strings(obj)


def should_delete_from_algolia(place: dict | None) -> bool:
    if not place:
        return True
    status = place.get("internal_status")
    visibility = place.get("visibility") or "public"
    return status == "rejected" or visibility == "hidden"


def review_item_update_kwargs(
    place_id: str,
    decision: str,
    comments: str | None = None,
    ts: str | None = None,
) -> dict[str, Any]:
    """Build Places_Places UpdateItem kwargs for AdminReview / review_place.py.

    No DynamoDB I/O. ``decision=in_review`` restores the approval slice of a
    fresh Places_Submit write: ``internal_status=in_review``,
    ``internal_verified=false``, and REMOVE of stored approval flags
    (``is_approved``, ``reviewed_ts``, ``reviewer``, and aliases).
    """
    if not ts:
        ts = utc_now()

    set_parts = ["internal_status = :st", "ts_last_updated = :ts"]
    values: dict[str, Any] = {":st": decision, ":ts": ts}

    if comments is not None and comments != "":
        set_parts.append("internal_comments = :c")
        values[":c"] = comments

    remove_parts: list[str] = []
    if decision == "in_review":
        set_parts.append("internal_verified = :iv")
        values[":iv"] = False
        remove_parts.extend(REVIEW_REVERT_REMOVE_ATTRS)

    expr = "SET " + ", ".join(set_parts)
    if remove_parts:
        expr += " REMOVE " + ", ".join(remove_parts)

    return {
        "Key": {"place_id": place_id},
        "UpdateExpression": expr,
        "ConditionExpression": "attribute_exists(place_id)",
        "ExpressionAttributeValues": values,
        "ReturnValues": "ALL_NEW",
    }
