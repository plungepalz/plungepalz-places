# PlungePalz Places API — Submission Flow (MVP)

This document is the **single source of truth** for the MVP place submission workflow.

Verification codes and “create with AI on submit” are **deferred**. AI autofill is an optional later call.

---

## Flow Overview

```
Place name + type + activity_types + lat/lng (+ address unless nature)
            ↓
        POST /submit
            ↓
  ONE TransactWriteItems:
    Places_Submissions  +  Places_Places
    (verified: false)      (internal_status: in_review, visibility: public)
            ↓
  201 { submission_id, place_id, place_slug, is_approved: false }
            ↓
  (Optional, later) POST /submit/ai_autofill
            ↓
  PlungePalz internal review — POST /plungepalz_admin/review
  or CLI: python scripts/review_place.py --place-id … --decision active
            ↓
         active → is_approved=true → Algolia upsert via Places_AlgoliaSync
         in_review → revert to a fresh POST /submit (pending, no Approved tag)
```

---

## Stage 1 — Place basics → POST /submit

The client sends core fields (no identity, no codes):

| Field | Required | Notes |
|-------|----------|-------|
| place_name | Yes | max 200 characters |
| place_type | Yes | business \| nature \| temporary_pop_up \| gym_amenity |
| activity_types | Yes | non-empty subset of cold_plunge, sauna |
| lat, lng | Yes | numbers in range |
| address | Yes unless nature | max 500 characters |
| description | No | max 2000 characters; preserved; AI will not overwrite a non-empty description |
| email | No | stored on the submission if valid |

### Places_Submit

1. Validates the body (400 + field `details` on failure).
2. Generates `place_id` (UUID v4) and `submission_id` (`sub_` + UUID).
3. Generates `place_slug` from name + parsed city + a short `place_id` suffix (avoids same-name/city collisions).
4. Computes `h3_r7` / `h3_r5` / `h3_r4` if `h3` is installed; **omits** those attributes otherwise. Never writes empty strings.
5. In **one** `TransactWriteItems`:
   - `Places_Submissions`: `submitted_ts`, `submitted_via=web_app`, `verified=false`, `place_id_generated`, `original_submission_record_json`
   - `Places_Places`: `internal_status=in_review`, `visibility=public`, timestamps `ts_created` / `ts_last_updated`
6. Returns 201 `{ submission_id, place_id, place_slug, is_approved: false }`

The place is immediately GetByID-able and Search-able (unless `approved_only=true`). It is not `is_approved` until admin review.

---

## Stage 2 — Optional AI autofill (off the submit path)

### Places_SubmitAIAutofill

**Auth: AWS_IAM** — admin-triggered only; not a public route. **Not** invoked by Submit. No verification-code gate.

1. Load submission and/or existing place (`place_id` or `submission.place_id_generated`).
2. **Claim first** with a conditional `SET ai_autofill_status = pending, ai_autofill_claimed_ts = now` (`attribute_exists(place_id)`; allowed when status is missing, not `pending`/`complete`, or `pending` with `ai_autofill_claimed_ts` older than 5 minutes). **409** (or **404** if the place is gone) and **no** Google/Anthropic calls on ConditionalCheckFailed. `failed` and stale `pending` can retry.
3. Call `generate_place_record()` from the `generate_place_with_ai` layer.
4. On success, `UpdateItem` **only** AI fields plus `ai_autofill_status=complete` and `ai_autofill_ts`. Do not replace user-submitted name/type/coords/address.
5. On failure, set `ai_autofill_status=failed`. Provider error strings are logged, never returned.
6. `description` is set only if the existing description is empty.

Model: `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`; `ANTHROPIC_MODEL_ID` is also accepted). Token cap: `ANTHROPIC_MAX_TOKENS` (default 1024).

---

## Stage 3 — Internal review

### Places_AdminReview (IAM) or `scripts/review_place.py` (boto3)

- Body: `{ place_id, decision: "active" | "rejected" | "in_review", internal_comments? }`
- Sets `internal_status`, `ts_last_updated`, optional `internal_comments`
- `decision=active` ⇒ `is_approved=true` on subsequent Search / GetByID
- `decision=in_review` reverts an approval to the exact approval state of a fresh `POST /submit`: `internal_status=in_review`, `is_approved` false (not stored; derived), `internal_verified=false`, and any stored `internal_comments` / `internal_verified_ts` / `reviewed_ts` / `reviewed_by` / `ts_reviewed` / `reviewer` / `is_approved` attributes removed. Visibility stays public. The Places_Places stream then upserts Algolia as pending (`internal_status=in_review`, `is_approved=false`).
- Stream → `Places_AlgoliaSync` upserts (active/in_review + public) or deletes (rejected/hidden)

Revert a single place or the first N seed ids (from `backend/`):

```bash
python scripts/review_place.py --place-id UUID --decision in_review
python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision in_review
```

---

## Stage 4 — Claiming (optional, unchanged / not MVP)

`POST /claim` after a $9.99 Stripe fee remains backlog.

---

## Sequence summary (MVP)

```
1. User enters place basics
2. POST /submit → Submissions + Places (in_review) in one transaction
3. (Optional) POST /submit/ai_autofill → UpdateItem AI fields only
4. POST /plungepalz_admin/review or review_place.py → active | rejected | in_review
5. (Optional, later) POST /claim
```

---

## Idempotency

- **Places_SubmitAIAutofill:** Conditional claim `SET ai_autofill_status = pending, ai_autofill_claimed_ts = now` before any paid outbound call (`attribute_exists(place_id)`). 409 if `complete` or a fresh `pending` (younger than 5 minutes). `failed` and stale `pending` may retry.
- **Places_AlgoliaSync:** `save_objects` by `objectID=place_id`; deletes of missing IDs are ignored.

---

## Deferred (not MVP)

- Email/SMS verification codes (`Places_SubmitVerify`)
- AI on the submit path
- Identity collection before the place exists
