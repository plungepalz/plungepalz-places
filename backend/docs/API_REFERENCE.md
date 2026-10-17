# PlungePalz Places API — API Reference

All endpoints return JSON. Base URL format: `https://{api-id}.execute-api.us-east-2.amazonaws.com/Places_PROD`

---

## GET /search

**Auth:** NONE  
**Lambda:** Places_Search  
**Tables:** Places_Places

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | No | Text search query |
| lat | number | No | Latitude for geo search |
| lng | number | No | Longitude for geo search |
| radius_km | number | No | Radius in km (default: 10) |
| place_type | string | No | Filter: business \| nature \| temporary_pop_up \| gym_amenity |
| activity_types | string | No | Comma-separated: cold_plunge, sauna |

### Request

```
GET /search?q=cold+plunge&lat=40.7608&lng=-111.8910&radius_km=20
```

### Success Response (200)

```json
{
  "places": [
    {
      "place_id": "uuid",
      "place_slug": "string",
      "place_name": "string",
      "place_type": "string",
      "address": "string",
      "city": "string",
      "state_province": "string",
      "country": "string",
      "activity_types": ["cold_plunge", "sauna"],
      "description": "string",
      "cover_image": "url or null",
      "external_ratings_ai_generated": {},
      "lat": "number",
      "lng": "number"
    }
  ],
  "total": 0
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid parameters |
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

Returns the full place record (see DATA_SCHEMAS.md).

### Error Responses

| Code | Meaning |
|------|---------|
| 404 | Place not found |
| 500 | Internal error |

---

## POST /submit

**Auth:** NONE  
**Lambda:** Places_Submit  
**Tables:** Places_Submissions

### Request Body

```json
{
  "identity": {
    "type": "username",
    "value": "plungepalz_user_id"
  },
  "email": "user@example.com",
  "phone_number": "+1234567890",
  "place_name": "string",
  "place_type": "business | nature | temporary_pop_up | gym_amenity",
  "activity_types": ["cold_plunge", "sauna"],
  "address": "string (required for non-nature)",
  "latitude": "number (required for nature)",
  "longitude": "number (required for nature)"
}
```

### Success Response (201)

```json
{
  "submission_id": "uuid",
  "message": "Verification codes sent to email and phone"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid request body |
| 500 | Internal error (SES/SNS failure) |

---

## POST /submit/verify

**Auth:** NONE  
**Lambda:** Places_SubmitVerify  
**Tables:** Places_Submissions

### Request Body

```json
{
  "submission_id": "uuid",
  "type": "email | username | phone_number",
  "value": "6-digit code or credential"
}
```

User must verify both email and phone (two calls or batched in future).

### Success Response (200)

```json
{
  "verified": true,
  "message": "Verification complete"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Missing submission_id or invalid type |
| 404 | Submission not found |
| 401 | Invalid verification code |
| 500 | Internal error |

---

## POST /submit/ai_autofill

**Auth:** NONE  
**Lambda:** Places_SubmitAIAutofill  
**Tables:** Places_Submissions, Places_Places

### Request Body

```json
{
  "submission_id": "uuid"
}
```

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
| 400 | Missing submission_id |
| 404 | Submission not found |
| 400 | verified is false |
| 409 | place_id_generated already set (idempotency) |
| 500 | AI autofill failed |
| 500 | Internal error |

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
  "internal_status": "active | rejected",
  "message": "Review complete"
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid decision |
| 401 | IAM auth failed |
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
