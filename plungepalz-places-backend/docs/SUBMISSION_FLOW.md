# PlungePalz Places API — Submission Flow

This document is the **single source of truth** for the end-to-end place submission workflow. Use it when building any part of the submission pipeline.

---

## Stage 1 — Identity

The submitter provides identity information:

- **PlungePalz user:** `identity: { type: "username", value: "plungepalz_user_id" }`
- **Non-user (email):** `identity: { type: "email", value: "email@example.com" }`

Additionally required:

- `email` — For verification code delivery
- `phone_number` — For SMS verification code

---

## Stage 2 — Place Basics

The user enters core place information:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| place_name | string | Yes | Display name |
| place_type | string | Yes | business \| nature \| temporary_pop_up \| gym_amenity |
| activity_types | array | Yes | ["cold_plunge"] and/or ["sauna"] |
| address | string | Yes for non-nature | Full street address |
| latitude | number | Yes for nature | For coordinates-based lookup |
| longitude | number | Yes for nature | For coordinates-based lookup |

**Submit clicked** → Client calls `POST /submit` with all data from Stage 1 + Stage 2.

---

## Stage 3 — Verification

### Places_Submit

1. Creates a `Places_Submissions` record with:
   - `submission_id` (UUID v4)
   - `source`: `mobile_app` | `web_app` | `admin_seed`
   - `verified`: false
   - `original_submission_record_json`: Full payload from client
   - `place_id_generated`: "" (empty)
2. Sends 6-digit **email code** via SES
3. Sends 6-digit **SMS code** via SNS
4. Returns `{ submission_id }` to client

### Places_SubmitVerify

User verifies both email and phone. Each verification call:

**Request body:**
```json
{
  "submission_id": "uuid",
  "type": "email | username | phone_number",
  "value": "6-digit code or credential"
}
```

- `type: "email"` → validate email 6-digit code
- `type: "phone_number"` → validate SMS 6-digit code
- `type: "username"` → for PlungePalz users (future: token-based)

On success for **both** email and phone:

- Set `verified: true`
- Set `verified_ts` to current UTC ISO timestamp

Client can then proceed to **Stage 4**.

---

## Stage 4 — AI Autofill

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
   - `address` (for non-nature) or `latitude`/`longitude` (for nature)
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
   - `bedrock_region` (from env)
   - `bedrock_model_id` (from env)
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
9. Generate `place_id` (UUID v4)
10. Write `result["record"]` to `Places_Places` via PutItem
    - Override `place_id` with generated UUID
    - Set `submission_id`
    - Set `internal_status: "in_review"`
11. Update `Places_Submissions`:
    - `ai_autofill_result`: `{ place_id, description, place_type_metadata, amenities, tags, external_ratings_ai_generated, google_places_api_data, ai_errors, generated_ts }`
    - `place_id_generated`: `place_id`
12. Return 200: `{ place_id, place_slug, ai_autofill_result }`

---

## Stage 5 — Internal Review

### Places_AdminReview

PlungePalz staff review the newly created place:

- **Request:** `{ place_id, decision: "active" | "rejected", internal_comments }`
- **Auth:** AWS_IAM
- **Action:** Update `Places_Places.internal_status` to `active` or `rejected`
- **Result:** Place is visible (or not) in public search based on `internal_status` and `visibility`

---

## Stage 6 — Claiming (Optional)

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
5. If approved → claimer can use **Places_Edit** to update the place

---

## Sequence Summary

```
1. User fills identity + place basics
2. POST /submit → Places_Submissions created, email + SMS codes sent
3. POST /submit/verify (email) → validate email code
4. POST /submit/verify (phone) → validate phone code
5. POST /submit/ai_autofill → generate_place_with_ai → Places_Places written, Places_Submissions updated
6. POST /plungepalz_admin/review → internal_status: active | rejected
7. (Optional) POST /claim → Stripe $9.99 → Places_ClaimedAudit in_review → approved → Places_Edit
```

---

## Idempotency

- **Places_SubmitAIAutofill** is idempotent: if `place_id_generated` is already set, return 409 and do not re-run AI or overwrite data.
