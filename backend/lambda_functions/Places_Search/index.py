"""
PlungePalz Places API — Places_Search

GET /search — queries Algolia (ALGOLIA_INDEX_NAME, search-only key).
"""

import os

from places_common import (
    ValidationError,
    error_response,
    parse_search_params,
    place_summary,
    success_response,
)
from places_common.records import should_delete_from_algolia


def _get_index():
    app_id = os.environ.get("ALGOLIA_APP_ID") or ""
    api_key = os.environ.get("ALGOLIA_SEARCH_API_KEY") or ""
    index_name = os.environ.get("ALGOLIA_INDEX_NAME") or "places_dev"
    if not app_id or not api_key:
        raise RuntimeError("Algolia search is not configured")
    from algoliasearch.search_client import SearchClient

    return SearchClient.create(app_id, api_key).init_index(index_name)


def _build_filters(params: dict) -> str:
    clauses = ["NOT internal_status:rejected", "NOT visibility:hidden"]
    if params.get("approved_only"):
        clauses.append("internal_status:active")
    place_types = params.get("place_types") or []
    if place_types:
        clauses.append("(" + " OR ".join(f"place_type:{t}" for t in place_types) + ")")
    activity_types = params.get("activity_types") or []
    if activity_types:
        clauses.append("(" + " OR ".join(f"activity_types:{t}" for t in activity_types) + ")")
    return " AND ".join(clauses)


def _search_options(params: dict) -> dict:
    opts = {
        "filters": _build_filters(params),
        "hitsPerPage": params["limit"],
        "page": params["page"],
        "attributesToRetrieve": [
            "place_id",
            "place_slug",
            "place_name",
            "place_type",
            "address",
            "city",
            "state_province",
            "country",
            "activity_types",
            "description",
            "cover_image",
            "lat",
            "lng",
            "is_approved",
            "ts_created",
            "_geoloc",
        ],
    }
    if params.get("bbox"):
        min_lng, min_lat, max_lng, max_lat = params["bbox"]
        # Algolia bbox order is minLat, minLng, maxLat, maxLng
        opts["insideBoundingBox"] = [[min_lat, min_lng, max_lat, max_lng]]
    elif params.get("lat") is not None and params.get("lng") is not None:
        opts["aroundLatLng"] = f"{params['lat']},{params['lng']}"
        opts["aroundRadius"] = max(1, int(round(float(params["radius_km"]) * 1000)))
    return opts


def handler(event, context):
    try:
        params = parse_search_params(event)
    except ValidationError as exc:
        return error_response(400, exc.code, exc.message, exc.details)

    try:
        index = _get_index()
        raw = index.search(params["q"], _search_options(params))
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Search failed")

    hits = raw.get("hits") or []
    total = int(raw.get("nbHits") if raw.get("nbHits") is not None else len(hits))
    limit = params["limit"]
    page = params["page"]

    places = []
    for hit in hits:
        if should_delete_from_algolia(hit):
            continue
        summary = place_summary(hit)
        # Never leak filter-only attributes
        summary.pop("internal_status", None)
        summary.pop("internal_comments", None)
        summary.pop("visibility", None)
        places.append(summary)

    has_more = (page + 1) * limit < total
    return success_response(
        200,
        {
            "places": places,
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": has_more,
        },
    )
