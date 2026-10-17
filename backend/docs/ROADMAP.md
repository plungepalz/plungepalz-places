# PlungePalz Places API — Roadmap

---

## ✅ Completed

- **CloudFormation stack:** `plungepalz-places-api-prod` deployed to `us-east-2`
- **Lambda Layer:** `generate_place_with_ai` — Google Places New API v1 + Claude (Anthropic API), pure logic, no DynamoDB writes
- **Places_SubmitAIAutofill:** Full implementation using `generate_place_with_ai` layer

---

## 🔨 In Progress

- **Places_Submit:** Create `Places_Submissions` record, send email + SMS verification codes
- **Places_SubmitVerify:** Validate email/phone codes, mark `verified: true`

---

## 📋 Backlog — Lambda Functions (not yet implemented)

| Function Name | Route | Priority | Notes |
|---------------|-------|----------|-------|
| Places_Search | GET /search | High | H3-based geo search; text query |
| Places_GetByID | GET /place/{place_id} | High | Fetch single place |
| Places_RatingsGet | GET /ratings/{place_id} | High | List ratings |
| Places_RatingsPost | POST /ratings/{place_id} | High | Create rating |
| Places_Claim | POST /claim | Medium | Stripe $9.99, Places_ClaimedAudit |
| Places_Report | POST /report | Medium | Abuse/duplicate reporting |
| Places_Edit | POST /edit | Medium | Claimer-only edits |
| Places_AdminReview | POST /plungepalz_admin/review | High | Approve/reject place |
| Places_AdminEditPlace | POST /plungepalz_admin/edit | Medium | Admin edit any place |

---

## 🗺️ Future Features

- **Weekly Google Places refresh job:** EventBridge → Lambda to refresh `google_places_api_data` for all active places
- **Bi-weekly Claude re-generation:** Update `external_ratings_ai_generated` via scheduled Lambda
- **Private Host place_type:** Backend support (Coming Soon — no schema built yet)
- **Places_Search H3-based geo search:** Use `h3_r7`, `h3_r5`, `h3_r4` indexes for efficient geo queries
- **Image upload pipeline:** S3 + CloudFront for `cover_image` and `header_image`
- **Stripe integration:** $9.99 claiming fee for Places_Claim
