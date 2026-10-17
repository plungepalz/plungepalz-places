#!/usr/bin/env python3
"""Apply Algolia index settings required by Places_Search / Places_AlgoliaSync.

Uses ALGOLIA_APP_ID + ALGOLIA_WRITE_API_KEY + ALGOLIA_INDEX_NAME (default places_dev).

    python scripts/algolia_index_settings.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SETTINGS = {
    "searchableAttributes": [
        "place_name",
        "description",
        "address",
        "city",
        "state_province",
        "country",
        "unordered(tags)",
    ],
    "attributesForFaceting": [
        "filterOnly(internal_status)",
        "filterOnly(visibility)",
        "filterOnly(place_type)",
        "filterOnly(activity_types)",
        "filterOnly(is_approved)",
    ],
    "unretrievableAttributes": [
        "internal_status",
        "internal_comments",
    ],
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
    # Newest-first for the no-geo catalog (empty query: all relevance
    # criteria tie, so customRanking wins). Geo and text still rank first
    # because `geo` / typo / words sit above `custom` in ranking.
    "customRanking": ["desc(ts_created_unix)"],
    "ranking": [
        "typo",
        "geo",
        "words",
        "filters",
        "proximity",
        "attribute",
        "exact",
        "custom",
    ],
    "hitsPerPage": 100,
    "maxValuesPerFacet": 20,
    "ignorePlurals": True,
    "removeStopWords": True,
}


def main() -> int:
    app_id = os.environ.get("ALGOLIA_APP_ID") or ""
    api_key = os.environ.get("ALGOLIA_WRITE_API_KEY") or ""
    index_name = os.environ.get("ALGOLIA_INDEX_NAME") or "places_dev"
    if not app_id or not api_key:
        print("ALGOLIA_APP_ID and ALGOLIA_WRITE_API_KEY are required", file=sys.stderr)
        print("Intended settings:", file=sys.stderr)
        print(json.dumps(SETTINGS, indent=2))
        return 1

    from algoliasearch.search_client import SearchClient

    index = SearchClient.create(app_id, api_key).init_index(index_name)
    index.set_settings(SETTINGS)
    print(json.dumps({"index": index_name, "applied": True, "settings": SETTINGS}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
