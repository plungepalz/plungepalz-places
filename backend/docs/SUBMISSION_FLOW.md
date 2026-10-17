# PlungePalz Places API — Submission Flow

This document is the **single source of truth** for the end-to-end place submission workflow. Use it when building any part of the submission pipeline.

---

## Flow Overview

```
Place Name + Place Type + Address
            ↓
  "Create Place With AI" clicked
            ↓
  Creates Places_Submissions record
       (verified: false)
            ↓
  Collect Email/Username + Phone
            ↓
  Email Code Sent → User Enters Code
       ↓ ✅ Email Verified
  SMS Code Sent → User Enters Code
       ↓ ✅ SMS Verified
            ↓
  AI Autofill Runs (Places_SubmitAIAutofill)
            ↓
  Places_Places record created
  (internal_status: "in_review")
            ↓
  Success Screen shown to user
            ↓
  PlungePalz Internal Review (Places_AdminReview)
            ↓
         active ✅
            ↓
  (Optional) Claim → $9.99 → Places_ClaimedAudit
            ↓
  Claimer manages listing via Places_Edit
```

---

## Stage 1 — Place Basics

The user enters core place information first:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| place_name | string | Yes | Display name |
| place_type | string | Yes | business \| nature \| temporary_pop_up \| gym_amenity |
| activity_types | array | Yes | ["cold_plunge"] and/or ["sauna"] |
| address | string | Yes for non-nature | Full street address |
| latitude | number | Yes for nature | For coordinates-based lookup |
| longitude | number | Yes for nature | For coordinates-based lookup |

**"Create Place With AI" clicked** → Client calls `POST /submit` with place basics. No identity required at this step.

---

## Stage 2 — Places_Submit: Create Submission

### Places_Submit

1. Creates a `Places_Submissions` record with:
   - `submission_id` (UUID v4)
   - `source`: `mobile_app` | `web_app` | `admin_seed`
   - `verified`: false
   - `original_submission_record_json`: Place basics from Stage 1
   - `place_id_generated`: "" (empty)
2. Returns `{ submission_id }` to client

**Note:** Email and SMS codes are not sent at this step. Identity is collected next.

---

## Stage 3 — Collect Identity

The user provides identity information:

- **PlungePalz user:** `identity: { type: "username", value: "plungepalz_user_id" }`
- **Non-user (email):** `identity: { type: "email", value: "email@example.com" }`

Additionally required:
- `email` — For verification code delivery
- `phone_number` — For SMS verification code

Client updates the submission with identity (or passes identity to the verification flow). This triggers code sending.

---

## Stage 4 — Verification

### Email Verification

1. **Email code sent** via SES (6-digit code)
2. User enters code
3. Client calls `POST /submit/verify` with `type: "email"` and the code
4. ✅ **Email verified**

### SMS Verification

1. **SMS code sent** via SNS (6-digit code)
2. User enters code
3. Client calls `POST /submit/verify` with `type: "phone_number"` and the code
4. ✅ **SMS verified**

### Places_SubmitVerify Request

```json
{
  "submission_id": "uuid",
  "type": "email | username | phone_number",
  "value": "6-digit code or credential"
}
```

On success for **both** email and phone:
- Set `verified: true`
- Set `verified_ts` to current UTC ISO timestamp

Client can then proceed to **Stage 5**.

---

## Stage 5 — AI Autofill

### Places_SubmitAIAutofill

**Request:**
```json
{
  "submission_id": "uuid"
}
```

**Flow:**

1. Load `Places_Submissions` by `submission_id`
2. **Fail if** not found (404) or `verified` is false (400)
3. **Fail if** `place_id_generated` already set (409 — idempotency guard)
4. Extract from `original_submission_record_json`:
   - `place_name`, `place_type`, `activity_types`
   - `address` (for non-nature) or `lat`/`lng` (or `latitude`/`longitude`) for nature
5. Build `place_location`:
   - If `place_type == "nature"`: `{ type: "coordinates", value: "{lng}|{lat}" }`
   - Otherwise: `{ type: "address", value: address }`
6. Call `generate_place_record()` from `generate_place_with_ai` layer:

   **Input to layer:**
   - `place_name`
   - `place_type`
   - `place_location` (address or coordinates)
   - `activity_types`
   - `google_places_api_key` (from env)
   - `anthropic_api_key` (from env)
   - `model_id` (from env)
   - `submission_id`

   **Layer output:**
   ```json
   {
     "success": true | false,
     "record": { ... } | null,
     "errors": ["string"],
     "partial": true | false
   }
   ```

7. If `success` is false → return 500 with `errors`
8. If `partial` is true → proceed anyway (partial result acceptable)
9. Write `result["record"]` to `Places_Places` via PutItem
   - Set `internal_status: "in_review"`
10. Update `Places_Submissions` with `ai_autofill_result` and `place_id_generated`
11. Return 200: `{ place_id, place_slug, ai_autofill_result }`

**Success screen** shown to user.

---

## Stage 6 — Internal Review

### Places_AdminReview

PlungePalz staff review the newly created place:

- **Request:** `{ place_id, decision: "active" | "rejected", internal_comments }`
- **Auth:** AWS_IAM
- **Action:** Update `Places_Places.internal_status` to `active` or `rejected`
- **Result:** Place is visible (or not) in public search based on `internal_status` and `visibility`

---

## Stage 7 — Claiming (Optional)

### Places_Claim

A business owner can claim a place after paying a $9.99 Stripe fee:

1. Client creates Stripe PaymentIntent for $9.99
2. Client calls `POST /claim` with `place_id`, claimer details, `stripe_payment_intent_id`
3. `Places_Claim` creates `Places_ClaimedAudit` record:
   - `place_id`, `ts_claimed`
   - `claimer_email`, `claimer_phone`, `claimer_name`
   - `status`: `in_review`
   - `stripe_payment_intent_id`
4. PlungePalz reviews claim → sets `status` to `approved` or `blocked`
5. If approved → **claimer manages listing via Places_Edit**

---

## Sequence Summary

```
1. User enters Place Name + Place Type + Address
2. "Create Place With AI" → POST /submit → Places_Submissions created (verified: false)
3. User provides Email/Username + Phone
4. Email code sent → POST /submit/verify (email) → ✅ Email verified
5. SMS code sent → POST /submit/verify (phone) → ✅ SMS verified
6. POST /submit/ai_autofill → Places_SubmitAIAutofill → Places_Places written → Success screen
7. POST /plungepalz_admin/review → internal_status: active
8. (Optional) POST /claim → Stripe $9.99 → Places_ClaimedAudit → Places_Edit for claimer
```

---

## Idempotency

- **Places_SubmitAIAutofill** is idempotent: if `place_id_generated` is already set, return 409 and do not re-run AI or overwrite data.
