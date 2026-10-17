# PlungePalz Places API — API Reference

All endpoints return JSON. Errors are always:

```json
{"error":{"code":"...","message":"...","details":{"field":"..."}}}
```

`details` is present on 400s (field-level). CORS headers are included on **every** response, including errors (`CORS_ALLOWED_ORIGIN`, default `*`).

**Environment (this MVP):** region `us-east-1`, stage `dev`. Public endpoints have no auth. Admin endpoints use AWS_IAM.

Base URL format: `https://{api-id}.execute-api.us-east-1.amazonaws.com/dev`

**Statuses:** `in_review` | `active` | `rejected`. `is_approved = (internal_status == "active")`.

See [SCHEMA_MAPPING](#schema-mapping-vs-data_schemasmd) for DynamoDB vs API field names. DynamoDB names are **not** renamed in storage.

---

## GET /search

**Auth:** NONE  
**Lambda:** Places_Search  
**Source:** Algolia index `ALGOLIA_INDEX_NAME` (dev: `places_dev`)

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | No | Text query |
| bbox | string | No | Map viewport `minLng,minLat,maxLng,maxLat` (**preferred** geo). Wins over lat/lng/radius when present. |
| lat | number | No | Geo alternative. Requires `lng`. Range [-90, 90]. |
| lng | number | No | Geo alternative. Requires `lat`. Range [-180, 180]. |
| radius_km | number | No | Geo radius in km (default 10). Ignored when `bbox` is present. |
| place_type | string | No | Comma-separated subset of `business,nature,temporary_pop_up,gym_amenity` |
| activity_types | string | No | Comma-separated subset of `cold_plunge,sauna` (match any) |
| approved_only | true\|false | No | Default `false`. When `true`, only `internal_status=active` |
| limit | integer | No | Default 100, min 1, max 500 |
| page | integer | No | 0-based, default 0 |

Always excludes `internal_status=rejected` and `visibility=hidden`. Never returns `internal_status` or `internal_comments`.

### Success Response (200)

```json
{
  "places": [
    {
      "place_id": "uuid",
      "place_slug": "plunge-lab-salt-lake-city",
      "place_name": "Plunge Lab",
      "place_type": "business",
      "address": "457 E 300 S, Salt Lake City, UT 84111",
      "city": "Salt Lake City",
      "state_province": "UT",
      "country": "USA",
      "activity_types": ["cold_plunge", "sauna"],
      "description": "string",
      "cover_image": "url or null",
      "lat": 40.7608,
      "lng": -111.891,
      "is_approved": false,
      "created_ts": "2026-02-20T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 0,
  "limit": 100,
  "has_more": false
}
```

`created_ts` is mapped from DynamoDB/Algolia `ts_created`. `lat`/`lng` are JSON numbers (storage is Decimal).

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Any bad param: bad bbox, out-of-range lat/lng, unknown enum, bad limit/page, partial lat/lng |
| 500 | Internal error |

---

## GET /place/{place_id}

**Auth:** NONE  
**Lambda:** Places_GetByID  
**Tables:** Places_Places

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| place_id | string | UUID of the place |

### Success Response (200)

The full public place record: [DATA_SCHEMAS.md](DATA_SCHEMAS.md) minus every `internal_*` attribute, **plus** `is_approved`. Storage names are preserved (`ts_created`, not `created_ts`).

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Missing place_id |
| 404 | Missing, `internal_status=rejected`, or `visibility=hidden` |
| 500 | Internal error |

---

## POST /submit

**Auth:** NONE  
**Lambda:** Places_Submit  
**Tables:** Places_Submissions, Places_Places (one `TransactWriteItems`)

MVP: **no verification codes** and **no AI autofill** on this path. Creates an `in_review` / `visibility=public` place immediately.

### Request Body

```json
{
  "place_name": "Plunge Lab",
  "place_type": "business",
  "activity_types": ["cold_plunge", "sauna"],
  "lat": 40.7608,
  "lng": -111.891,
  "address": "457 E 300 S, Salt Lake City, UT 84111",
  "description": "optional",
  "email": "optional@example.com"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| place_name | yes | string |
| place_type | yes | `business` \| `nature` \| `temporary_pop_up` \| `gym_amenity` |
| activity_types | yes | non-empty subset of `cold_plunge`, `sauna` |
| lat, lng | yes | numbers in range |
| address | yes unless `place_type` is `nature` | |
| description | no | |
| email | no | basic format check if present |

Empty strings are never written. H3 `h3_r7` / `h3_r5` / `h3_r4` are set when the `h3` lib is available and **omitted** when it is not.

### Success Response (201)

```json
{
  "submission_id": "sub_…",
  "place_id": "uuid",
  "place_slug": "plunge-lab-salt-lake-city",
  "is_approved": false
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid body (field-level `details`) |
| 409 | Conditional transaction conflict |
| 500 | Internal error |

---

## POST /submit/verify

**Auth:** NONE  
**Lambda:** Places_SubmitVerify  
**Status:** Placeholder (not in MVP). Verification codes are deferred.

---

## POST /submit/ai_autofill

**Auth:** NONE  
**Lambda:** Places_SubmitAIAutofill  
**Tables:** Places_Submissions, Places_Places

**Opt-in**, off the submit path. Enriches an **existing** place via `UpdateItem`. No `verified` gate.

Touches only AI-generated fields: `description` (only if currently empty), `place_type_metadata`, `amenities`, `tags`, `external_ratings_ai_generated`, `google_places_api_data`. User-submitted fields are preserved.

Spend: `ANTHROPIC_MODEL_ID` (default cheap Haiku `claude-3-5-haiku-latest`), `ANTHROPIC_MAX_TOKENS` (default 1024, cap 2048), per-place `ai_autofill_ts` idempotency guard (409 if already enriched).

### Request Body

```json
{
  "submission_id": "uuid",
  "place_id": "uuid"
}
```

Provide `submission_id` and/or `place_id`. `submission_id` loads `place_id_generated`.

### Success Response (200)

```json
{
  "place_id": "uuid",
  "place_slug": "string",
  "ai_autofill_result": {
    "place_id": "uuid",
    "description": "string",
    "place_type_metadata": {},
    "amenities": [],
    "tags": [],
    "external_ratings_ai_generated": {},
    "google_places_api_data": {},
    "ai_errors": [],
    "generated_ts": "YYYY-MM-DDTHH:MM:SSZ"
  }
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Missing ids / missing location |
| 404 | Submission or place not found |
| 409 | Already AI-enriched (`ai_autofill_ts` set) |
| 500 | AI autofill failed |

---

## GET /ratings/{place_id}

**Auth:** NONE  
**Lambda:** Places_RatingsGet  
**Tables:** Places_RatingsComments

### Success Response (200)

```json
{
  "ratings": [
    {
      "place_id": "uuid",
      "ts_created": "YYYY-MM-DDTHH:MM:SSZ",
      "user_id": "string",
      "rating": 4.5,
      "comment": "string",
      "activity_type": "cold_plunge | sauna"
    }
  ],
  "average_rating": 4.2,
  "total_count": 15
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 404 | Place not found |
| 500 | Internal error |

---

## POST /ratings/{place_id}

**Auth:** NONE  
**Lambda:** Places_RatingsPost  
**Tables:** Places_RatingsComments

### Request Body

```json
{
  "user_id": "string",
  "rating": 4.5,
  "comment": "string (optional)",
  "activity_type": "cold_plunge | sauna"
}
```

### Success Response (201)

```json
{
  "rating_id": "string",
  "place_id": "uuid",
  "ts_created": "YYYY-MM-DDTHH:MM:SSZ"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid rating (1.0–5.0) or missing fields |
| 404 | Place not found |
| 500 | Internal error |

---

## POST /claim

**Auth:** NONE  
**Lambda:** Places_Claim  
**Tables:** Places_Places, Places_ClaimedAudit

### Request Body

```json
{
  "place_id": "uuid",
  "claimer_email": "string",
  "claimer_phone": "string",
  "claimer_name": "string",
  "stripe_payment_intent_id": "string"
}
```

### Success Response (201)

```json
{
  "claim_id": "string",
  "place_id": "uuid",
  "status": "in_review",
  "message": "Claim submitted. Awaiting review."
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid request or place already claimed |
| 404 | Place not found |
| 402 | Payment required (Stripe $9.99) |
| 500 | Internal error |

---

## POST /report

**Auth:** NONE  
**Lambda:** Places_Report  
**Tables:** Places_Places (external_reporting array)

### Request Body

```json
{
  "place_id": "uuid",
  "report_type": "incorrect_info | duplicate | spam | abuse | other",
  "reporter_email": "string (optional)",
  "reporter_user_id": "string (optional)",
  "details": "string (optional)"
}
```

### Success Response (200)

```json
{
  "message": "Report received. Thank you."
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid report_type |
| 404 | Place not found |
| 500 | Internal error |

---

## POST /edit

**Auth:** NONE  
**Lambda:** Places_Edit  
**Tables:** Places_Places, Places_ClaimedAudit

Only the approved claimer can edit. Request must include proof of claim (e.g. Cognito identity, claim token).

### Request Body

```json
{
  "place_id": "uuid",
  "claimer_token": "string",
  "updates": {
    "place_name": "string",
    "address": "string",
    "description": "string",
    "place_type_metadata": {},
    "amenities": [],
    "place_website_url": "string"
  }
}
```

### Success Response (200)

```json
{
  "place_id": "uuid",
  "message": "Place updated"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid updates |
| 401 | Unauthorized (not claimer) |
| 404 | Place not found |
| 500 | Internal error |

---

## POST /plungepalz_admin/review

**Auth:** AWS_IAM  
**Lambda:** Places_AdminReview  
**Tables:** Places_Places

Sets `internal_status` to `active` or `rejected`, optional `internal_comments`, and `ts_last_updated`. Approving flips `is_approved` to true (derived). The Places_Places stream then upserts/deletes Algolia.

CLI (boto3 DynamoDB, not SigV4 to API Gateway):

```bash
python scripts/review_place.py --place-id UUID --decision active
python scripts/review_place.py --place-id UUID --decision rejected --comments "duplicate"
```

Requires `dynamodb:GetItem` + `dynamodb:UpdateItem` on `TABLE_PLACES`. Same write as the Lambda.

### Request Body

```json
{
  "place_id": "uuid",
  "decision": "active | rejected",
  "internal_comments": "string (optional)"
}
```

### Success Response (200)

```json
{
  "place_id": "uuid",
  "internal_status": "active",
  "is_approved": true,
  "message": "Review complete"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid decision |
| 401 | IAM auth failed (API Gateway) |
| 404 | Place not found |
| 500 | Internal error |

---

## POST /plungepalz_admin/edit

**Auth:** AWS_IAM  
**Lambda:** Places_AdminEditPlace  
**Tables:** Places_Places

### Request Body

```json
{
  "place_id": "uuid",
  "updates": {
    "place_name": "string",
    "internal_status": "string",
    "internal_comments": "string",
    "place_type_metadata": {},
    "visibility": "public | hidden"
  }
}
```

### Success Response (200)

```json
{
  "place_id": "uuid",
  "message": "Place updated"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid updates |
| 401 | IAM auth failed |
| 404 | Place not found |
| 500 | Internal error |

---

## Schema mapping vs DATA_SCHEMAS.md

Storage (DynamoDB) keeps DATA_SCHEMAS.md names. The response layer maps:

| API / client | DynamoDB | Notes |
|--------------|----------|-------|
| `created_ts` (PlaceSummary) | `ts_created` | Mapped in Search / Algolia objects only. GetByID returns `ts_created`. |
| `lat`, `lng` JSON number | `Number` (Decimal) | Converted for JSON and Algolia `_geoloc` |
| `is_approved` | *(derived)* | `internal_status == "active"` — not stored |
| `internal_status` | `internal_status` | `in_review` \| `active` \| `rejected`. Filter-only in Algolia; never returned by Search or GetByID |
| POST /submit `lat`/`lng` | `lat`/`lng` | Older API_REFERENCE used `latitude`/`longitude` — those names are not accepted in MVP |
| `ai_autofill_ts` | *(MVP extension)* | Per-place spend/idempotency guard; not yet in DATA_SCHEMAS.md |

Conflicts flagged, not silently renamed:

- Schema samples still show empty strings (`claimed_ts: ""`, `internal_comments: ""`). MVP **omits** empty strings on write.
- Schema `Places_Submissions` is described as existing *before* a place is created. MVP writes both records in one transaction (`place_id_generated` set immediately, `verified` remains false).
- PlaceSummary no longer includes `external_ratings_ai_generated` (GetByID still can, as a public schema field).
