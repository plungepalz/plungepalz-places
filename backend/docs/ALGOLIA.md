# Algolia index — Places (dev)

Index name (dev): `places_dev` (`ALGOLIA_INDEX_NAME`).

`Places_AlgoliaSync` upserts/deletes this index from the `Places_Places` DynamoDB stream.
`Places_Search` queries it with `ALGOLIA_SEARCH_API_KEY` (search-only).

## Record shape

| Attribute | Role |
|-----------|------|
| `objectID` | `place_id` |
| `_geoloc` | `{lat, lng}` for geo / bbox |
| PlaceSummary fields | `place_id`, `place_slug`, `place_name`, `place_type`, `address`, `city`, `state_province`, `country`, `activity_types`, `description`, `cover_image`, `lat`, `lng`, `is_approved`, `created_ts` |
| `internal_status` | **filter only** — never returned by Search |
| `visibility` | filter only |
| `place_type`, `activity_types` | filters |

Deletes when `internal_status=rejected`, `visibility=hidden`, or stream `REMOVE`.

## Required settings

Apply with:

```bash
cd backend
python scripts/algolia_index_settings.py
```

Or set manually in the Algolia dashboard:

```json
{
  "searchableAttributes": [
    "place_name",
    "description",
    "address",
    "city",
    "state_province",
    "country",
    "unordered(tags)"
  ],
  "attributesForFaceting": [
    "filterOnly(internal_status)",
    "filterOnly(visibility)",
    "filterOnly(place_type)",
    "filterOnly(activity_types)",
    "filterOnly(is_approved)"
  ],
  "unretrievableAttributes": ["internal_status", "internal_comments"]
}
```

Search always adds `NOT internal_status:rejected AND NOT visibility:hidden`.
`approved_only=true` adds `internal_status:active`.

`bbox` uses `insideBoundingBox` (Algolia order: minLat,minLng,maxLat,maxLng — converted from our minLng,minLat,maxLng,maxLat). Geo alternative uses `aroundLatLng` + `aroundRadius` (meters).
