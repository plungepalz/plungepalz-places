# places_common Lambda layer

Shared helper used by every HTTP Lambda in this API. Chosen as a **Lambda layer** (not a vendored package) so it matches `generate_place_with_ai` and deploys as `/opt/python/places_common`.

## What it provides

- CORS headers on **every** response, including errors (`CORS_ALLOWED_ORIGIN`, default `*`)
- Error envelope `{"error":{"code","message","details"?}}`
- Decimal → JSON
- Query/body validation (search, submit, admin review)
- PlaceSummary / GET /place/{id} allowlists (`ts_created` ISO 8601 UTC; GetByID is an explicit field list, not strip-internal_*)
- H3 / slug helpers and DynamoDB TypeSerializer helpers (no table I/O)

## Attach to

All public HTTP Lambdas, plus `Places_AdminReview` and `Places_AlgoliaSync`.

Package:

```bash
cd backend/lambda_layers/places_common
zip -r places_common.zip python/
```
