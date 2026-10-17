# PlungePalz Places Frontend

Local Next.js app for browsing a global map of sauna and cold plunge locations. Mock data is the default. Point `NEXT_PUBLIC_API_BASE_URL` at the live Places API to browse the real catalog.

## Setup

Requires **Node.js 22 or later** (`mapbox-gl` does not install cleanly on older Node). `frontend/.nvmrc` pins 22; `package.json` `engines.node` is `>=22`.

```bash
cd frontend
npm install
cp .env.example .env.local
```

## Running locally against the dev API

1. Use Node 22 (`nvm use` in `frontend/` reads `.nvmrc`).
2. `npm install`
3. Copy `.env.example` to `.env.local` (never commit `.env.local`).
4. Set the API URL from CloudFormation stack `plungepalz-places-dev`, output `ApiBaseUrl`:

```bash
aws cloudformation describe-stacks \
  --stack-name plungepalz-places-dev \
  --profile plungepalz-dev \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text
```

Paste that value into `NEXT_PUBLIC_API_BASE_URL`. `.env.example` only has a placeholder:

```bash
NEXT_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/dev
```

5. Set `NEXT_PUBLIC_MAPBOX_TOKEN` to a public token from [account.mapbox.com](https://account.mapbox.com/). Without it, the map shows a placeholder and the list/filters still work.
6. `npm run dev` and open **http://localhost:3000**. That origin is the CORS allowlist for the dev API (`Access-Control-Allow-Origin: http://localhost:3000`). A different port will fail CORS.

### Switch back to mock mode

The client uses mocks when the base URL is unset, **or** when `NEXT_PUBLIC_USE_MOCKS=true` (even if a URL is set). Either:

```bash
# Option A — unset / omit the URL
# NEXT_PUBLIC_API_BASE_URL=

# Option B — force mocks while keeping the URL around
NEXT_PUBLIC_USE_MOCKS=true
```

Restart `npm run dev` after changing env vars.

### Troubleshooting

| Symptom | What to check |
|---|---|
| Browser console CORS error, or network calls fail from the UI | Serve the app at **http://localhost:3000**. Another origin/port is not on the API allowlist. |
| Map is a placeholder / “add a token” message | `NEXT_PUBLIC_MAPBOX_TOKEN` is missing, blank, or still the `.env.example` placeholder (`pk.your_mapbox_token_here`). The app treats those as no token and shows the map placeholder instead of loading Mapbox. List/filters still work. |
| `400` with `{"error":{"code":"VALIDATION_ERROR",...}}` | The request params/body failed backend validation. Example: `limit` must be `<= 500`. Field-level `details` names the bad field. A missing place is `404` `{"error":{"code":"NOT_FOUND","message":"Place not found"}}`. |

## Scripts

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
npm test         # tsx --test 'lib/**/*.test.ts'
npm start        # production server after build
```

Dev and build use webpack (`--webpack`) because `react-map-gl` v8 does not resolve cleanly under Turbopack yet. Tailwind v4 is wired through `postcss.config.mjs` (`@tailwindcss/postcss`).

## Env vars

| Variable | Client? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | Mapbox GL token. Missing, blank, and `pk.your_mapbox_token_here` count as no token. |
| `NEXT_PUBLIC_API_BASE_URL` | yes | Places API origin (no hardcoded fallback) |
| `NEXT_PUBLIC_USE_MOCKS` | yes | `true` forces the in-memory mock client |

`.env*` is gitignored except `.env.example`.

## API client

Typed client in `lib/` for:

- `GET /search`
- `GET /place/{place_id}`
- `POST /submit`

Mock mode is used when the base URL is unset, or when `NEXT_PUBLIC_USE_MOCKS=true`. The mock catalog is ~29 places across several countries, mixed place types, some `is_approved: true` and some false. One mock nature place has `address` / `city` / `state_province` / `country` as `null` (same shape as the live API). `POST /submit` in mock mode validates the body (including field `details` on 400s with `code: "VALIDATION_ERROR"`) and appends the place so later searches include it without an Approved tag.

## Contract this UI is built against

This supersedes `backend/docs/API_REFERENCE.md` where they differ (lead-engineer MVP notes):

**GET /search query params**

- `q`
- `bbox=minLng,minLat,maxLng,maxLat` (current map viewport; preferred)
- `lat` / `lng` / `radius_km` fallback (bbox wins if both)
- `place_type` — comma list of `business,nature,temporary_pop_up,gym_amenity`
- `activity_types` — comma list of `cold_plunge,sauna` (match any)
- `approved_only` (default false; UI sends `approved_only=true` when the filter is on)
- `limit` (default 100, max 500) and `page` (0-based)

**GET /search response:** `{ places, total, page, limit, has_more }`. The search backend (Algolia) cannot page past **1000** hits; `has_more` is false once that cap is reached. The mock client matches this.

Each place: `place_id`, `place_slug`, `place_name`, `place_type`, `address`, `city`, `state_province`, `country`, `activity_types[]`, `description`, `cover_image` (url\|null), `lat`, `lng` (numbers), `is_approved` (bool), `ts_created`. **Nature places may have `address`, `city`, `state_province`, and `country` as `null`.** Cards, the list header, and the details drawer skip those fields instead of showing “Unknown location”. The TypeScript types also allow optional `postal_code?: string | null`. **The live API does not return `postal_code` on `GET /search` or `GET /place/{id}` for the MVP** (it exists only on the Algolia object). The details drawer appends it after city/state when a payload includes it (mocks may), e.g. `Scottsdale, AZ 85251`.

With neither `bbox` nor `lat`/`lng`, `/search` returns the **global catalog**, paginated, newest first by `ts_created`. Mocks sort the same way.

**Approval:** show the Approved tag only when `is_approved === true`. Pending submissions come back with `is_approved: false`. Rejected/hidden places are excluded server-side. Public payloads do **not** expose `internal_status` or `internal_comments`. The Approved-only filter both sends `approved_only=true` and drops locally merged pending places.

**GET /place/{place_id}:** flat public object — search summary fields plus optional `place_website_url`, `amenities[]`, `tags[]`, `place_type_metadata{}`, `external_ratings_ai_generated{}`, `hours_of_operation` (string or `null`), `ts_last_updated`. Missing or null optionals (including empty amenities/tags) are skipped in the details drawer. 404 if not found.

**POST /submit body:** `place_name` (max 200), `place_type`, `activity_types` (non-empty `cold_plunge`/`sauna`), `lat`, `lng` (required; not latitude/longitude), `address` (required unless nature; max 500), optional `description` (max 2000) and `email`. **201:** `{ submission_id, place_id, place_slug, is_approved: false }`. No verification step. Indexing is async on the real backend, so `/search` may take a second or two to include the new place.

**Errors:** `{ error: { code, message, details? } }`. `400`s use `code: "VALIDATION_ERROR"` (search: `"Invalid request parameters"`; submit: `"Invalid request body"`). `details` is the per-field map. A missing place is `{"error":{"code":"NOT_FOUND","message":"Place not found"}}`.

## Add a place

The top bar **Add a place** button opens a **non-modal** dialog (`role="dialog"`, no `aria-modal`, no focus trap) so you can click the map behind it to drop a pin. Escape closes it only when focus is inside the form or on the map (not when typing in the top-bar search). Focus moves to the close button on open and is restored on close.

- Click the map to drop or move a pin, or choose **Use map center**. Chosen `lat` / `lng` are shown (and can be typed). Without a Mapbox token, use the current location chip’s coordinates instead.
- Address is required unless place type is Nature. **Find on map** geocodes the address with Mapbox when `NEXT_PUBLIC_MAPBOX_TOKEN` is set; without a token it is skipped with a short note.
- Client-side validation mirrors the `POST /submit` contract (including max lengths) before the request is sent. Inputs cap at those lengths. A 400 maps `error.details` onto the matching fields (including description) and also shows `error.message`.
- On 201 the form closes, the pending place (`is_approved: false`, no Approved tag) is merged into the map and list until `/search` returns it, the map flies to it, and a brief success message appears. Turning **Approved only** on hides those local pending rows and queries with `approved_only=true`.

## Layout

Sweatpals-style map-first view:

- Top bar: location chip, filter icon, Sauna / Cold plunge chips, place-type filters, search, **Add a place**
- Left: white rounded list floating over the map (`N places in {area}`, or `Showing X of Y` when `/search` `has_more` is true or the page is capped), cards with thumbnail, Approved tag, title, place type, city (omitted when null), favorite star
- Right / background: full-screen Mapbox map. Clusters and pins are a GeoJSON source with symbol layers (black teardrop + count; orange pin). Zoom +/− and locate-me stay reachable when the details drawer or add-place form is open.
- Map move (debounced) re-queries `/search` with `bbox`; list shows what’s in view
- Hover/select syncs card ↔ pin; click opens a details drawer via `GET /place/{place_id}`

## Known MVP limits

- **Map clustering is client-side Mapbox GeoJSON clustering** on the current `/search` result set. Viewport queries request `limit=500` (API max) so clusters are meaningful; places beyond that page are not clustered until Load more. There is no server cluster endpoint yet. Orange pins are a solid teardrop (cover images are on cards, not map symbols).
- Search pagination stops at Algolia's **1000-hit cap**. The UI trusts `has_more` from `/search`; the mock client also sets `has_more: false` once 1000 results have been returned.
- Mock mode is the default until `NEXT_PUBLIC_API_BASE_URL` is set.
