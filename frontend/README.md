# PlungePalz Places Frontend

Local Next.js app for browsing a global map of sauna and cold plunge locations. The backend Lambdas are still stubs, so this app runs against **mock data** until `NEXT_PUBLIC_API_BASE_URL` is set.

## Setup

Requires **Node.js 22 or later** (`mapbox-gl` does not install cleanly on older Node). `frontend/.nvmrc` pins 22; `package.json` `engines.node` is `>=22`.

```bash
cd frontend
npm install
cp .env.example .env.local
```

Edit `frontend/.env.local` (never commit this file):

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here
# Optional until the API is live — omit to stay in mock mode
NEXT_PUBLIC_API_BASE_URL=https://your-api-gateway.execute-api.us-east-1.amazonaws.com/dev
# Optional: force mocks even if a base URL is set
# NEXT_PUBLIC_USE_MOCKS=true
```

Get a Mapbox public token from [account.mapbox.com](https://account.mapbox.com/). Without it, the map shows a placeholder and the list/filters still work.

## Scripts

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
npm start        # production server after build
```

Dev and build use webpack (`--webpack`) because `react-map-gl` v8 does not resolve cleanly under Turbopack yet. Tailwind v4 is wired through `postcss.config.mjs` (`@tailwindcss/postcss`).

## Env vars

| Variable | Client? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | Mapbox GL token |
| `NEXT_PUBLIC_API_BASE_URL` | yes | Places API origin (no hardcoded fallback) |
| `NEXT_PUBLIC_USE_MOCKS` | yes | `true` forces the in-memory mock client |

`.env*` is gitignored except `.env.example`.

## API client

Typed client in `lib/` for:

- `GET /search`
- `GET /place/{place_id}`
- `POST /submit` (typed function only; no submit form UI in this PR)

Mock mode is used when the base URL is unset, or when `NEXT_PUBLIC_USE_MOCKS=true`. The mock catalog is ~28 places across several countries, mixed place types, some `is_approved: true` and some false. `POST /submit` in mock mode appends the place so it would show on the map without an Approved tag.

## Contract this UI is built against

This supersedes `backend/docs/API_REFERENCE.md` where they differ (lead-engineer MVP notes):

**GET /search query params**

- `q`
- `bbox=minLng,minLat,maxLng,maxLat` (current map viewport; preferred)
- `lat` / `lng` / `radius_km` fallback (bbox wins if both)
- `place_type` — comma list of `business,nature,temporary_pop_up,gym_amenity`
- `activity_types` — comma list of `cold_plunge,sauna` (match any)
- `approved_only` (default false)
- `limit` (default 100, max 500) and `page` (0-based)

**GET /search response:** `{ places, total, page, limit, has_more }`. The search backend (Algolia) cannot page past **1000** hits; `has_more` is false once that cap is reached. The mock client matches this.

Each place: `place_id`, `place_slug`, `place_name`, `place_type`, `address`, `city`, `state_province`, `country`, `activity_types[]`, `description`, `cover_image` (url\|null), `lat`, `lng` (numbers), `is_approved` (bool), `ts_created`.

With neither `bbox` nor `lat`/`lng`, `/search` returns the **global catalog**, paginated, newest first by `ts_created`. Mocks sort the same way.

**Approval:** show the Approved tag only when `is_approved === true`. Pending submissions come back with `is_approved: false`. Rejected/hidden places are excluded server-side. Public payloads do **not** expose `internal_status` or `internal_comments`.

**GET /place/{place_id}:** flat public object — search summary fields plus optional `place_website_url`, `amenities[]`, `tags[]`, `place_type_metadata{}`, `external_ratings_ai_generated{}`, `hours_of_operation` (string or `null`), `ts_last_updated`. Missing or null optionals are skipped in the details drawer. 404 if not found.

**POST /submit body:** `place_name`, `place_type`, `activity_types` (non-empty `cold_plunge`/`sauna`), `lat`, `lng` (required; not latitude/longitude), `address` (required unless nature), optional `description` and `email`. **201:** `{ submission_id, place_id, place_slug, is_approved: false }`. No verification step.

**Errors:** `{ error: { code, message, details? } }`. `details` is the per-field map on 400s from `/submit`.

## Layout

Sweatpals-style map-first view:

- Top bar: location chip, filter icon, Sauna / Cold plunge chips, place-type filters, search
- Left: white rounded list floating over the map (`N places in {area}`), cards with thumbnail, Approved tag, title, place type, city, favorite star
- Right / background: full-screen Mapbox map. Clusters and pins are a GeoJSON source with symbol layers (black teardrop + count; orange pin). Zoom +/− and locate-me stay reachable when the details drawer is open.
- Map move (debounced) re-queries `/search` with `bbox`; list shows what’s in view
- Hover/select syncs card ↔ pin; click opens a details drawer via `GET /place/{place_id}`

## Known MVP limits

- **Map clustering is client-side Mapbox GeoJSON clustering** on the current `/search` result set. Viewport queries request `limit=500` (API max) so clusters are meaningful; places beyond that page are not clustered until Load more. There is no server cluster endpoint yet. Orange pins are a solid teardrop (cover images are on cards, not map symbols).
- Search pagination stops at Algolia's **1000-hit** cap. The UI trusts `has_more` from `/search`; the mock client also sets `has_more: false` once 1000 results have been returned.
- Mock mode is the default until `NEXT_PUBLIC_API_BASE_URL` is set (dev URL still TBD).
