# PlungePalz Places API — Roadmap

---

## ✅ Completed

- **Lambda Layer:** `generate_place_with_ai` — Google Places New API v1 + Claude, no DynamoDB writes
- **Lambda Layer:** `places_common` — CORS, errors, validation, public sanitizing
- **Places_Submit:** TransactWrite submission + in_review place (no verification)
- **Places_Search:** Algolia GET /search
- **Places_GetByID:** DynamoDB GET /place/{place_id}
- **Places_SubmitAIAutofill:** Opt-in UpdateItem enrichment (no verified gate)
- **Places_AdminReview:** IAM approve/reject/revert-to-in_review + `scripts/review_place.py`
- **Places_AlgoliaSync:** Places_Places stream → Algolia upsert/delete

---

## 🔨 Deferred / not MVP

- **Places_SubmitVerify:** Email + SMS verification codes
- **AI on the submit path:** Submit does not call Anthropic

---

## 📋 Backlog — Lambda Functions (not yet implemented)

| Function Name | Route | Priority | Notes |
|---------------|-------|----------|-------|
| Places_RatingsGet | GET /ratings/{place_id} | High | List ratings |
| Places_RatingsPost | POST /ratings/{place_id} | High | Create rating |
| Places_Claim | POST /claim | Medium | Stripe $9.99, Places_ClaimedAudit |
| Places_Report | POST /report | Medium | Abuse/duplicate reporting |
| Places_Edit | POST /edit | Medium | Claimer-only edits |
| Places_AdminEditPlace | POST /plungepalz_admin/edit | Medium | Admin edit any place |

---

## 🗺️ Future Features

- **Weekly Google Places refresh job:** EventBridge → Lambda to refresh `google_places_api_data` for all active places
- **Bi-weekly Claude re-generation:** Update `external_ratings_ai_generated` via scheduled Lambda
- **Private Host place_type:** Backend support (Coming Soon — no schema built yet)
- **Places_Search H3-based geo search:** Use `h3_r7`, `h3_r5`, `h3_r4` indexes for efficient geo queries (Algolia geo used for MVP)
- **Image upload pipeline:** S3 + CloudFront for `cover_image` and `header_image`
- **Stripe integration:** $9.99 claiming fee for Places_Claim
