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

# PlaceSummary response fields (Search). created_ts is mapped from ts_created.
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
    "created_ts",
)

# Stored on the Algolia object in addition to PlaceSummary (filters only).
ALGOLIA_FILTER_ATTRIBUTES = ("internal_status", "visibility", "place_type", "activity_types")
