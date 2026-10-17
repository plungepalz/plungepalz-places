"""
PlungePalz Places — shared Lambda helper layer.

Pure logic only: no DynamoDB I/O. Attach this layer to every HTTP Lambda.
Packaging: `python/places_common/` so `import places_common` works from /opt/python.

Provides:
- CORS headers on every response (CORS_ALLOWED_ORIGIN, default *)
- Canonical error shape {"error": {"code", "message", "details"?}}
- Decimal-to-JSON encoding
- Query/body validation helpers
- Public-record sanitizing (strip internal_*) and PlaceSummary mapping
"""

from .http import (  # noqa: F401
    ValidationError,
    cors_headers,
    error_response,
    json_dumps,
    parse_json_body,
    success_response,
)
from .records import (  # noqa: F401
    algolia_object_from_place,
    compute_h3,
    deserialize_stream_image,
    generate_place_slug,
    is_approved,
    new_place_id,
    new_submission_id,
    omit_empty_strings,
    parse_address_parts,
    place_summary,
    public_place,
    serialize_item,
    should_delete_from_algolia,
    to_jsonable,
    utc_now,
)
from .validate import (  # noqa: F401
    parse_search_params,
    validate_review_body,
    validate_submit_body,
)

__all__ = [
    "ValidationError",
    "compute_h3",
    "cors_headers",
    "deserialize_stream_image",
    "error_response",
    "generate_place_slug",
    "is_approved",
    "json_dumps",
    "omit_empty_strings",
    "parse_address_parts",
    "parse_json_body",
    "parse_search_params",
    "place_summary",
    "public_place",
    "serialize_item",
    "success_response",
    "to_jsonable",
    "utc_now",
    "validate_submit_body",
]
