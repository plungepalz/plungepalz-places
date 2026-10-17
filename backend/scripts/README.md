# Backend scripts

Run these from `backend/` unless noted.

## Seed places (`seed_places.py`)

Loads verified real-world sauna and cold plunge venues from `seed_data/places_seed.json` and creates them through the public API (`POST /submit`). It does **not** call AI autofill and does not need provider API keys.

The API base URL is required and is never hardcoded:

```bash
export PLACES_API_BASE_URL="https://{api-id}.execute-api.us-east-1.amazonaws.com/dev"
python scripts/seed_places.py --dry-run
python scripts/seed_places.py --limit 10
python scripts/seed_places.py --base-url "$PLACES_API_BASE_URL" --output scripts/seed_data/.seed_places_created.json
```

`--base-url` overrides `PLACES_API_BASE_URL`.

Each seed row has `name`, `place_type`, `activity_types`, `lat`, `lng`, `address` (required except `nature`), optional `website`, and `source_url` (the OSM or official page used for coordinates). Only documented submit fields are posted (`place_name`, `place_type`, `activity_types`, `lat`, `lng`, `address`).

Idempotency:

1. Skip keys already stored in the local state file (default `scripts/seed_data/.seed_places_state.json`, gitignored).
2. Before each submit, `GET /search?q={name}&lat={lat}&lng={lng}&radius_km=1` and skip a confident match (same normalized name within about 200 m). Matches are written back to the state file.

`--dry-run` prints the exact POST bodies and makes **no** HTTP requests. `--limit N` processes only the first N seed rows (`N` must be >= 1). `--sleep` (default `0.5`) waits that many seconds between API calls; `--sleep 0` disables it.

A successful run **merges** created `place_id`s into `--output` (default `scripts/seed_data/.seed_places_created.json`, gitignored), de-duplicated, so a later partial run does not wipe ids that `review_place.py --from-file` still needs.

## Review / approve / revert (`review_place.py`)

Writes `internal_status` on `TABLE_PLACES` with boto3 (not SigV4 to API Gateway). Same write as `Places_AdminReview`. `--decision in_review` reverts an approval to a fresh `POST /submit` (pending on the map, no Approved tag, `is_approved` false, `internal_comments` / `internal_verified_ts` / review metadata cleared). The Places_Places stream upserts Algolia as pending.

```bash
python scripts/review_place.py --place-id UUID --decision active
python scripts/review_place.py --place-id UUID --decision rejected --comments "duplicate"
python scripts/review_place.py --place-id UUID --decision in_review
python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision active
python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision in_review
```

`--from-file` reads `place_ids` (or a `created` array) from the seed output file. `--limit` (requires `--from-file`, must be >= 1) reviews the first N ids. Do not run this against production unless you intend to flip those places.

## Other scripts

- `local_invoke.py` — invoke a Lambda handler locally (see [docs/TESTING.md](../docs/TESTING.md))
- `algolia_index_settings.py` — apply the `places_dev` index settings
- `run_layer_test.py` — layer helper used by local invoke
