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

## Backfill from DynamoDB

`Places_AlgoliaSync` is a stream consumer. If the event-source mapping starts at `LATEST`, writes that happen around enablement can miss the index (one write about 25s after the mapping was enabled never reached Algolia). Use `scripts/backfill_algolia.py` to repair that gap, seed a new index, or resync after an accidental wipe.

The script paginated-Scans `TABLE_PLACES` (default `Places_Places`) and applies the **same** `places_common.records` mapping and allowlist as `Places_AlgoliaSync` (`objectID=place_id`, `_geoloc`, `ts_created_unix`, PlaceSummary fields, `internal_status`, `visibility`). Rejected or hidden items are **deleted** from the index (not skipped), matching the stream handler. Missing `place_id` is skipped. Upserts use `save_objects` in batches of ~500 and are idempotent by `objectID`.

### When to run

- After enabling the Places_Places → AlgoliaSync stream mapping (`LATEST` can miss near-enable writes)
- To seed `places_dev` (or another index) from DynamoDB as source of truth
- To repair drift if a stream batch failed or an object was deleted from Algolia by mistake

Dry-run first. The live run needs Algolia write credentials and DynamoDB scan access; it does not write to DynamoDB.

### Usage

From `backend/`, with the standard AWS credential chain (env, shared config, or instance/task role):

```bash
# Scan + map only. No Algolia writes. No Algolia credentials required.
python scripts/backfill_algolia.py --dry-run

# Upsert/delete to match DynamoDB (idempotent by objectID)
python scripts/backfill_algolia.py

# Cap how many table items to process (--limit must be >= 1)
python scripts/backfill_algolia.py --limit 50

# Also delete Algolia objectIDs that are not in DynamoDB (full scan only)
python scripts/backfill_algolia.py --prune

# Dry-run prune: browse the index read-only and report would_prune (creds required to browse)
python scripts/backfill_algolia.py --dry-run --prune

# Prune a non-dev index (ALGOLIA_INDEX_NAME must match --confirm-index)
python scripts/backfill_algolia.py --prune --confirm-index "$ALGOLIA_INDEX_NAME"
```

`--prune` cannot be combined with `--limit`. It only runs after a complete scan with **zero errors** and **at least one item**; otherwise it is skipped (`prune_skipped`: `empty_scan` or `scan_errors`) and errors exit nonzero. Every scanned `place_id` is added to the keep set **before** mapping, so a classify/skip failure cannot prune that id. `--prune` uses `ConsistentRead=True` on the DynamoDB Scan. Live runs print the target index name to stderr before writing. Pruning any index other than `places_dev` requires `--confirm-index <name>`.

Prints a JSON summary: `scanned`, `indexed`, `skipped` (and `skipped_reasons`), `deleted` (and `deleted_reasons`), `pruned`, `would_prune` (dry-run prune), `errors`. `--dry-run` also includes a few mapped samples.

### Environment (env vars only — never commit values)

| Variable | Required | Default | Role |
|----------|----------|---------|------|
| `TABLE_PLACES` | no | `Places_Places` | DynamoDB table to Scan |
| `AWS_REGION` | no | `us-east-1` | boto3 region (`AWS_DEFAULT_REGION` is fallback) |
| `ALGOLIA_APP_ID` | yes, unless `--dry-run` | — | Algolia app |
| `ALGOLIA_WRITE_API_KEY` | yes, unless `--dry-run` | — | Write key (same as AlgoliaSync) |
| `ALGOLIA_INDEX_NAME` | no | `places_dev` | Target index |

Uses `algoliasearch>=3,<4` (`SearchClient.create` → `init_index`), same as `Places_AlgoliaSync`.

### IAM

Caller needs:

- `dynamodb:Scan` on `Places_Places` (or whatever `TABLE_PLACES` is)

No DynamoDB writes. Algolia access is the write API key, not IAM. AWS credentials follow the default boto3 chain.
