"""Shared enums and PlaceSummary field list."""

VALID_PLACE_TYPES = frozenset({"business", "nature", "temporary_pop_up", "gym_amenity"})
VALID_ACTIVITY_TYPES = frozenset({"cold_plunge", "sauna"})
VALID_INTERNAL_STATUSES = frozenset({"in_review", "active", "rejected"})
VALID_VISIBILITY = frozenset({"public", "hidden"})
VALID_REVIEW_DECISIONS = frozenset({"active", "rejected"})

DEFAULT_SEARCH_LIMIT = 100
MAX_SEARCH_LIMIT = 500
MIN_SEARCH_LIMIT = 1
DEFAULT_RADIUS_KM = 10.0

# Algolia only paginates the first paginationLimitedTo hits (default 1000).
# Single source of truth for the request clamp and has_more.
ALGOLIA_PAGINATION_CAP = 1000

# Reclaim a stale pending autofill after this many seconds.
AI_AUTOFILL_STALE_PENDING_SECONDS = 300


def algolia_pagination_cap(raw: dict | None = None) -> int:
    """Return paginationLimitedTo from an Algolia response, else ALGOLIA_PAGINATION_CAP."""
    if raw:
        value = raw.get("paginationLimitedTo")
        if value is not None:
            try:
                cap = int(value)
                if cap > 0:
                    return cap
            except (TypeError, ValueError):
                pass
    return ALGOLIA_PAGINATION_CAP

MAX_PLACE_NAME_LEN = 200
MAX_ADDRESS_LEN = 500
MAX_DESCRIPTION_LEN = 2000

AI_AUTOFILL_STATUS_PENDING = "pending"
AI_AUTOFILL_STATUS_COMPLETE = "complete"
AI_AUTOFILL_STATUS_FAILED = "failed"

# PlaceSummary response fields (Search and the prefix of GET /place/{id}).
PLACE_SUMMARY_FIELDS = (
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
)

# GET /place/{id} is this allowlist only — not "all public schema fields".
PLACE_DETAIL_FIELDS = PLACE_SUMMARY_FIELDS + (
    "place_website_url",
    "amenities",
    "tags",
    "place_type_metadata",
    "external_ratings_ai_generated",
    "hours_of_operation",
    "ts_last_updated",
)

# Stored on the Algolia object in addition to PlaceSummary (filters only).
ALGOLIA_FILTER_ATTRIBUTES = ("internal_status", "visibility", "place_type", "activity_types")
