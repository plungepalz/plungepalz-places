# Algolia index — Places (dev)

Index name (dev): `places_dev` (`ALGOLIA_INDEX_NAME`).

`Places_AlgoliaSync` upserts/deletes this index from the `Places_Places` DynamoDB stream.
`Places_Search` queries it with `ALGOLIA_SEARCH_API_KEY` (search-only).

## Record shape

| Attribute | Role |
|-----------|------|
| `objectID` | `place_id` |
| `_geoloc` | `{lat, lng}` for geo / bbox |
| PlaceSummary fields | `place_id`, `place_slug`, `place_name`, `place_type`, `address`, `city`, `state_province`, `country`, `activity_types`, `description`, `cover_image`, `lat`, `lng`, `is_approved`, `ts_created` |
| `ts_created_unix` | numeric unix seconds — **ranking only**, not returned by Search |
| `internal_status` | **filter only** — never returned by Search |
| `visibility` | filter only |
| `place_type`, `activity_types` | filters |

Deletes when `internal_status=rejected`, `visibility=hidden`, or stream `REMOVE`.

## Ranking (newest-first catalog, sensible geo/text)

No sort replica. One index:

- `customRanking: ["desc(ts_created_unix)"]`
- Default Algolia `ranking`: `typo, geo, words, filters, proximity, attribute, exact, custom`

Behavior:

| Query | What ranks |
|-------|------------|
| Neither `bbox` nor `lat`/`lng` (global catalog) | Relevance criteria all tie → **newest first** (`ts_created` desc) |
| Text `q` | Typo/words/etc. first; recency only as a tiebreaker |
| `bbox` / aroundLatLng | `geo` (distance / viewport) first; recency as a tiebreaker |

Apply with:

```bash
cd backend
python scripts/algolia_index_settings.py
```

Or set manually:

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
  "unretrievableAttributes": ["internal_status", "internal_comments"],
  "customRanking": ["desc(ts_created_unix)"],
  "ranking": ["typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"]
}
```

Search always adds `NOT internal_status:rejected AND NOT visibility:hidden`.
`approved_only=true` adds `internal_status:active`.

`place_type` and `activity_types` query params are **comma-separated lists**.

`bbox` uses `insideBoundingBox` (Algolia order: minLat,minLng,maxLat,maxLng — converted from our minLng,minLat,maxLng,maxLat). Geo alternative uses `aroundLatLng` + `aroundRadius` (meters).
