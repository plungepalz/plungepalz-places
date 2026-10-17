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

`bbox` uses `insideBoundingBox` (Algolia order: minLat,minLng,maxLat,maxLng — converted from our minLng,minLat,maxLng,maxLat). Bbox **lat** is clamped to ±90; **lng** is wrapped with `((x+180)%360)-180`. A raw span `maxLng-minLng >= 360` is the whole world. After wrap, `minLng > maxLng` is sent as **two** boxes. Geo alternative uses `aroundLatLng` + `aroundRadius` (meters).

## Pagination cap

Algolia only retrieves the first `paginationLimitedTo` hits (index default **1000**, `ALGOLIA_PAGINATION_CAP` in `places_common.constants`). `Places_Search` requests with `offset=page*limit` and `length=min(limit, cap-offset)` — never `page`/`hitsPerPage`, which would skip rows when the last window is shortened. If `offset >= cap`, it returns empty results and does not query Algolia. `has_more` uses the same `algolia_pagination_cap()` helper: `(page+1)*limit < min(nbHits, paginationLimitedTo or 1000)`. Clients must stop loading when `has_more` is false; `total` may still report the raw `nbHits` above the cap.
