# PlungePalz Places API — System Architecture

## 1. System Overview

The PlungePalz Places API is a serverless backend on AWS.

```
Client (Web/Mobile)
       │
       ▼
   API Gateway (REST API)  us-east-1 / stage dev
       │
       ├── Public endpoints (auth: NONE)
       └── Admin endpoints (auth: AWS_IAM)
       │
       ▼
   Lambda Functions
       │
       ├── DynamoDB (Places_Places stream → Places_AlgoliaSync)
       ├── Algolia (places_dev)
       ├── Anthropic API (Claude) — optional autofill
       └── Google Places New API v1 — optional autofill
```

All DynamoDB writes occur **only** inside Lambda functions (or the operator CLI `scripts/review_place.py`). Lambda Layers contain pure logic and never perform DB operations.

---

## 2. API Gateway

| Attribute | Value |
|-----------|-------|
| Region | `us-east-1` |
| Stage | `dev` |
| Auth (Public) | `NONE` |
| Auth (Admin) | `AWS_IAM` |

### Full Route Table

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | NONE | Algolia search (bbox / geo / text) |
| GET | `/place/{place_id}` | NONE | Get single place by ID |
| POST | `/submit` | NONE | Create submission + in_review place |
| POST | `/submit/verify` | NONE | Placeholder (deferred) |
| POST | `/submit/ai_autofill` | NONE | Opt-in AI enrich of existing place |
| GET | `/ratings/{place_id}` | NONE | Get ratings |
| POST | `/ratings/{place_id}` | NONE | Post a rating |
| POST | `/claim` | NONE | Claim a place |
| POST | `/report` | NONE | Report abuse |
| POST | `/edit` | NONE | Edit claimed place |
| POST | `/plungepalz_admin/review` | **AWS_IAM** | Approve/reject place |
| POST | `/plungepalz_admin/edit` | **AWS_IAM** | Admin edit any place |

---

## 3. Lambda Functions

| Function Name | Route / trigger | Timeout | Memory | Status | Description |
|---------------|-----------------|---------|--------|--------|-------------|
| Places_Submit | POST /submit | 30s | 256MB | MVP | TransactWrite submission + place |
| Places_SubmitVerify | POST /submit/verify | 10s | 256MB | Deferred | Placeholder |
| Places_SubmitAIAutofill | POST /submit/ai_autofill | 60s | 512MB | MVP | UpdateItem AI fields only |
| Places_Search | GET /search | 15s | 256MB | MVP | Algolia query |
| Places_GetByID | GET /place/{place_id} | 5s | 256MB | MVP | DynamoDB get |
| Places_AlgoliaSync | DynamoDB stream (Places_Places) | 30s | 256MB | MVP | Upsert/delete Algolia |
| Places_AdminReview | POST /plungepalz_admin/review | 15s | 256MB | MVP | Set active/rejected |
| Places_RatingsGet | GET /ratings/{place_id} | 10s | 256MB | Backlog | Get ratings |
| Places_RatingsPost | POST /ratings/{place_id} | 10s | 256MB | Backlog | Post rating |
| Places_Claim | POST /claim | 30s | 256MB | Backlog | Claim place |
| Places_Report | POST /report | 10s | 256MB | Backlog | Report abuse |
| Places_Edit | POST /edit | 15s | 256MB | Backlog | Edit claimed place |
| Places_AdminEditPlace | POST /plungepalz_admin/edit | 15s | 256MB | Backlog | Admin edit |

---

## 4. Lambda Layers

### places_common

**Choice:** Lambda layer under `backend/lambda_layers/places_common` (not a vendored package), same layout as `generate_place_with_ai`.

Shared by every HTTP handler: CORS, error shape, Decimal JSON, validation, public-record sanitizing. **No DynamoDB I/O.**

See `lambda_layers/places_common/README.md`.

### generate_place_with_ai

**Purpose:** Google Places New API v1 + Claude → structured place fields. **No DynamoDB writes.**

| Attribute | Value |
|-----------|-------|
| Entry Point | `generate_place_record(...)` |
| Parameters | `place_name`, `place_type`, `place_location`, `activity_types`, `google_places_api_key`, `anthropic_api_key`, `model_id`, `submission_id`, `max_tokens=1024` |
| Returns | `{ success, record, errors, partial }` |

---

## 5. DynamoDB Tables

| Table | PK | SK | Purpose |
|-------|-----|-----|---------|
| Places_Places | place_id | — | Canonical place records. **Enable stream** `NEW_AND_OLD_IMAGES` → Places_AlgoliaSync |
| Places_Submissions | submission_id | — | Submission metadata |
| Places_RatingsComments | place_id | ts_created | Ratings |
| Places_ClaimedAudit | place_id | ts_claimed | Claims |

---

## 6. Algolia

See [ALGOLIA.md](ALGOLIA.md). Dev index: `places_dev`.

---

## 7. Env vars (AWS Bot — never commit values)

| Variable | Used by |
|----------|---------|
| `TABLE_PLACES` | GetByID, Submit, AdminReview, SubmitAIAutofill, review_place.py |
| `TABLE_SUBMISSIONS` | Submit, SubmitAIAutofill |
| `ALGOLIA_APP_ID` | Search, AlgoliaSync, index-settings script |
| `ALGOLIA_SEARCH_API_KEY` | Search only |
| `ALGOLIA_WRITE_API_KEY` | AlgoliaSync, index-settings script |
| `ALGOLIA_INDEX_NAME` | Search, AlgoliaSync (dev: `places_dev`) |
| `CORS_ALLOWED_ORIGIN` | All HTTP Lambdas (default `*`) |
| `GOOGLE_PLACES_API_KEY` | SubmitAIAutofill |
| `ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY` | SubmitAIAutofill |
| `ANTHROPIC_MODEL_ID` | SubmitAIAutofill (default `claude-3-5-haiku-latest`) |
| `ANTHROPIC_MAX_TOKENS` | SubmitAIAutofill (default 1024, max 2048) |
| `AWS_REGION` | `us-east-1` |

---

## 8. IAM per Lambda (AWS Bot)

| Lambda | IAM |
|--------|-----|
| Places_Search | none beyond logs (Algolia via env key) |
| Places_GetByID | `dynamodb:GetItem` on Places_Places |
| Places_Submit | `dynamodb:TransactWriteItems`, `PutItem` on Places_Places + Places_Submissions |
| Places_AdminReview | `dynamodb:UpdateItem`, `GetItem` on Places_Places |
| Places_SubmitAIAutofill | `GetItem`/`UpdateItem` on Places_Places + Places_Submissions; outbound HTTPS to Google + Anthropic |
| Places_AlgoliaSync | Stream read: `dynamodb:DescribeStream`, `GetRecords`, `GetShardIterator`, `ListStreams` on Places_Places stream. No table writes. Algolia via write key. |

Shared: `logs:CreateLogStream`, `logs:PutLogEvents`.

**Stream:** Places_Places `StreamSpecification.StreamViewType = NEW_AND_OLD_IMAGES`. Event source mapping → Places_AlgoliaSync (batch size 25 is fine; handler already groups upserts/deletes). Starting position `LATEST` (or `TRIM_HORIZON` for backfill).

**Runtime deps:** attach `places_common` layer to all HTTP Lambdas + AlgoliaSync. Attach `generate_place_with_ai` to SubmitAIAutofill. Package `algoliasearch` with Search and AlgoliaSync (`lambda_functions/*/requirements.txt`).

---

## 9. AI stack

- **Model:** `claude-3-5-haiku-latest` via `ANTHROPIC_MODEL_ID`
- **Invocation:** `tool_use` + `tool_choice` `populate_place_listing`
- **Google Places New API v1:** `places.googleapis.com/v1`

---

## 10. Shared response contract

Every HTTP Lambda uses `places_common.success_response` / `error_response`:

```python
{
    "statusCode": int,
    "headers": {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "<CORS_ALLOWED_ORIGIN or *>"
    },
    "body": json.dumps(...)
}
```

Errors: `{"error":{"code":"...","message":"...","details"?}}`.
