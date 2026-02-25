# PlungePalz Places API — System Architecture

## 1. System Overview

The PlungePalz Places API is a production serverless backend built on AWS. The architecture follows this flow:

```
Client (Web/Mobile)
       │
       ▼
   API Gateway (REST API)
       │
       ├── Public endpoints (auth: NONE)
       └── Admin endpoints (auth: AWS_IAM)
       │
       ▼
   Lambda Functions (12 total)
       │
       ├── DynamoDB (4 tables)
       ├── Bedrock (Claude Haiku)
       └── Google Places New API v1
```

**External Dependencies:**

- **AWS Bedrock** — Claude Haiku for AI-generated descriptions, metadata, and ratings
- **Google Places New API v1** — Place lookup, address, hours, rating, phone, website

All DynamoDB writes occur **only** inside Lambda functions; Lambda Layers contain pure logic and never perform DB operations.

---

## 2. API Gateway

| Attribute | Value |
|-----------|-------|
| Stack Name | `plungepalz-places-api-prod` |
| Stage | `Places_PROD` |
| Region | `us-east-2` (Ohio) |
| Auth (Public) | `NONE` |
| Auth (Admin) | `AWS_IAM` |

### Full Route Table

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | NONE | Search places by query + geo |
| GET | `/place/{place_id}` | NONE | Get single place by ID |
| POST | `/submit` | NONE | Submit new place (stage 1–2) |
| POST | `/submit/verify` | NONE | Verify email/SMS codes |
| POST | `/submit/ai_autofill` | NONE | Run AI autofill on verified submission |
| GET | `/ratings/{place_id}` | NONE | Get ratings for a place |
| POST | `/ratings/{place_id}` | NONE | Post a rating |
| POST | `/claim` | NONE | Claim a place (business owner) |
| POST | `/report` | NONE | Report abuse/incorrect info |
| POST | `/edit` | NONE | Edit claimed place (claimer only) |
| POST | `/plungepalz_admin/review` | **AWS_IAM** | Admin: approve/reject place |
| POST | `/plungepalz_admin/edit` | **AWS_IAM** | Admin: edit any place |

---

## 3. Lambda Functions

| Function Name | Route | Method | Timeout | Memory | Status | Description |
|---------------|-------|--------|---------|--------|--------|-------------|
| Places_Submit | /submit | POST | 30s | 256MB | In Progress | Create submission, send email+SMS codes |
| Places_SubmitVerify | /submit/verify | POST | 10s | 256MB | In Progress | Validate codes, mark verified |
| Places_SubmitAIAutofill | /submit/ai_autofill | POST | 60s | 512MB | Complete | AI autofill → write Places_Places |
| Places_Search | /search | GET | 15s | 256MB | Backlog | Geo + text search |
| Places_GetByID | /place/{place_id} | GET | 5s | 256MB | Backlog | Fetch place by ID |
| Places_RatingsGet | /ratings/{place_id} | GET | 10s | 256MB | Backlog | Get ratings |
| Places_RatingsPost | /ratings/{place_id} | POST | 10s | 256MB | Backlog | Post rating |
| Places_Claim | /claim | POST | 30s | 256MB | Backlog | Claim place, Stripe fee |
| Places_Report | /report | POST | 10s | 256MB | Backlog | Report abuse |
| Places_Edit | /edit | POST | 15s | 256MB | Backlog | Edit claimed place |
| Places_AdminReview | /plungepalz_admin/review | POST | 15s | 256MB | Backlog | Approve/reject place |
| Places_AdminEditPlace | /plungepalz_admin/edit | POST | 15s | 256MB | Backlog | Admin edit any place |

---

## 4. Lambda Layers

### generate_place_with_ai

**Purpose:** Calls Google Places New API v1 and Claude Haiku via Bedrock to produce a fully populated `Places_Places` record. **No DynamoDB writes** — pure input/output.

| Attribute | Value |
|-----------|-------|
| Entry Point | `generate_place_record(...)` |
| Parameters | `place_name`, `place_type`, `place_location`, `activity_types`, `google_places_api_key`, `bedrock_region`, `bedrock_model_id`, `submission_id` |
| Returns | `{ success, record, errors, partial }` |
| External Calls | Google Places (searchText → place details), Bedrock (Claude Haiku) |
| Rule | **Never** writes to DynamoDB — caller (Lambda) is responsible for all DB operations |

---

## 5. DynamoDB Tables

| Table | PK | SK | Purpose |
|-------|-----|-----|---------|
| Places_Places | place_id | — | Canonical place records |
| Places_Submissions | submission_id | — | Submission drafts and verification state |
| Places_RatingsComments | place_id | ts_created | Ratings and comments per place |
| Places_ClaimedAudit | place_id | ts_claimed | Claim history and status |

---

## 6. AI Stack

### Bedrock

- **Model:** `anthropic.claude-haiku-4-5-20251001-v1:0`
- **Invocation Pattern:** `tool_use` with `tool_choice: { "type": "any" }`
- **Tool Name:** `populate_place_listing`
- **Fields Generated:** `description`, `place_type_metadata`, `amenities`, `tags`, `external_ratings_ai_generated`

### Google Places New API v1

- **Base URL:** `https://places.googleapis.com/v1/`
- **Flow:** `searchText` → place ID → place details
- **Field Mask:** `id`, `displayName`, `formattedAddress`, `location`, `rating`, `userRatingCount`, `websiteUri`, `nationalPhoneNumber`, `formattedPhoneNumber`, `regularOpeningHours`, `businessStatus`, `googleMapsUri`, `editorialSummary`, `types`

---

## 7. Submission Flow Sequence (Text Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 1–2: Place Basics entered → Submit clicked                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Places_Submit → Places_Submissions created (verified: false)                 │
│                 → Email code sent                                            │
│                 → SMS code sent                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Places_SubmitVerify → User verifies email + phone via POST /submit/verify    │
│                       Request: { submission_id, type, value }                │
│                       → verified: true                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Places_SubmitAIAutofill → Calls generate_place_with_ai layer                  │
│                          → Google Places lookup                              │
│                          → Claude Haiku generates fields                     │
│                          → place_id (UUID v4) generated                      │
│                          → Places_Places written (internal_status: in_review) │
│                          → Places_Submissions updated with ai_autofill_result │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Places_AdminReview → PlungePalz internal review                              │
│                     → internal_status: active | rejected                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ (Optional) Places_Claim → $9.99 Stripe fee → Places_ClaimedAudit (in_review) │
│                          → PlungePalz approves → Places_Edit for claimer     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. IAM Role: PlacesLambdaExecutionRole

The Lambda execution role grants:

- **Bedrock:** `bedrock:InvokeModel` on the specified model
- **DynamoDB:** Full CRUD on `Places_Places`, `Places_Submissions`, `Places_RatingsComments`, `Places_ClaimedAudit`
- **SES:** `ses:SendEmail` for verification emails
- **SNS:** `sns:Publish` for SMS verification codes
- **CloudWatch Logs:** `logs:CreateLogStream`, `logs:PutLogEvents`
- **X-Ray:** `xray:PutTraceSegments`, `xray:PutTelemetryRecords` (optional)
