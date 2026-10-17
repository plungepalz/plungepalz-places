# PlungePalz Places API — DynamoDB Data Schemas

## Places_Places

**PK:** `place_id` (String, UUID v4)  
**Purpose:** Canonical place records for cold plunge and sauna locations.

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| place_id | String | UUID v4, primary key |
| submission_id | String | Links to Places_Submissions |
| h3_r7 | String | H3 cell res 7 (~1.2km urban) |
| h3_r5 | String | H3 cell res 5 (~8.5km regional) |
| h3_r4 | String | H3 cell res 4 (~60km wide) |
| lat | Number (Decimal) | Latitude |
| lng | Number (Decimal) | Longitude |
| place_name | String | Display name |
| place_type | String | business \| nature \| temporary_pop_up \| gym_amenity |
| visibility | String | public \| hidden (default: public) |
| place_slug | String | `{name}-{city}-{place_id_suffix}` hyphenated lowercase |
| address | String | Full street address |
| city | String | City name |
| state_province | String | State or province |
| country | String | Country code or name |
| activity_types | List[String] | ["cold_plunge"] or ["sauna"] or both |
| description | String | AI-generated or manual description |
| place_type_metadata | Map | See sub-schemas below |
| amenities | List[String] | e.g. ["showers", "lockers", "towels"] |
| has_plungepalz_discount | Boolean | True if discount exists |
| place_website_url | String | Primary website |
| use_google_places_api_data | Boolean | Whether to use Google data |
| google_places_api_data | Map | Cached Google Places response |
| latest_google_places_refresh | String | ISO timestamp UTC of last refresh |
| images | List[Map] | Image URLs/metadata |
| cover_image | String \| null | Primary image URL |
| header_image | String \| null | Header/banner image URL |
| internal_status | String | in_review \| active \| rejected. `is_approved` is derived (`internal_status == "active"`) and is **not** stored. `decision=in_review` restores a fresh Submit: `in_review`, `internal_verified=false`, and removes leftover `is_approved` / `internal_comments` / `internal_verified_ts` / `reviewed_ts` / `reviewed_by` / `ts_reviewed` / `reviewer`. |
| internal_comments | String | Admin notes; omitted on Submit and removed on an `in_review` revert |
| internal_verified | Boolean | Manual verification flag; `false` on Submit and after an `in_review` revert |
| internal_verified_ts | String | ISO timestamp UTC; omitted on Submit and removed on an `in_review` revert |
| external_reporting | List[Map] | Abuse/duplicate reports |
| total_plunge_sessions_recorded | Number | Counter |
| total_sauna_sessions_recorded | Number | Counter |
| external_ratings_ai_generated | Map | AI-generated ratings data for ONLY Google and ClassPass (if NOT a "nature" "place_type") |
| tags | List[String] | Discovery tags |
| ts_created | String | ISO timestamp UTC |
| ts_last_updated | String | ISO timestamp UTC |
| claimed_ts | String | ISO timestamp UTC when claimed; omitted if unclaimed |
| ai_autofill_ts | String | ISO timestamp UTC when AI autofill last completed; omitted until then |
| ai_autofill_status | String | pending \| complete \| failed; omitted if never attempted |
| ai_autofill_claimed_ts | String | ISO timestamp UTC when the current/last autofill claim was taken; a pending claim older than 5 minutes may be reclaimed |

`hours_of_operation` is **not** a top-level Places_Places attribute. The public GET /place API lifts it from `place_type_metadata.hours_of_operation` (business / gym_amenity) when present, otherwise returns `null`.

### place_type_metadata Sub-Schemas

#### business

| Field | Type | Description |
|-------|------|-------------|
| hours_of_operation | String | e.g. "Mon-Fri 6am-9pm" |
| experience_type | String | Community \| Private Room(s) \| Hybrid |
| access_type | String | pay \| membership \| free |
| entry_fee_usd | Number | Fee in USD |
| membership_available | Boolean | |
| walk_ins_allowed | Boolean | |
| is_on_classpass | Boolean | |
| booking_url | String | |
| direct_phone | String | |
| direct_email | String | |
| instagram_link | String | |
| website_link | String | |
| plungepalz_discount | String | Discount description |
| discount_verified | Boolean | |
| cold_plunge_details | List[Map] | See cold_plunge_details schema |
| sauna_details | List[Map] | See sauna_details schema |

#### nature

| Field | Type | Description |
|-------|------|-------------|
| time_of_season | List[String] | e.g. ["spring", "summer"] |
| access_type | String | free \| parking_fee |
| nature_type | String | river \| lake \| creek \| ocean \| pond \| stream \| avanto |
| entry_fee_usd | Number | 0 if free |
| entry_fee_notes | String | |
| has_parking_lot_area | Boolean | |
| hike_info | Map | difficulty: easy \| moderate \| hard \| strenuous, distance_km, etc. |
| additional_comments | String | |

#### temporary_pop_up

| Field | Type | Description |
|-------|------|-------------|
| date_of_operation | String | Date range |
| recurrence | Map | type: daily \| weekly \| bi-weekly \| monthly \| bi-monthly |
| special_notes | String | |
| access_type | String | pay \| free |
| entry_fee_usd | Number | |
| membership_available | Boolean | |
| requires_booking | Boolean | |
| booking_url | String | |
| direct_phone | String | |
| direct_email | String | |
| display_phone | String | |
| display_email | String | |
| instagram_link | String | |
| plungepalz_discount | String | |
| discount_verified | Boolean | |
| cold_plunge_details | List[Map] | |
| sauna_details | List[Map] | |

#### gym_amenity

| Field | Type | Description |
|-------|------|-------------|
| hours_of_operation | String | |
| special_notes | String | |
| experience_type | String | Community \| Private Room(s) \| Hybrid |
| access_type | String | pay \| membership \| free |
| entry_fee_usd | Number | |
| membership_available | Boolean | |
| requires_gym_membership | Boolean | |
| non_member_access_notes | String | |
| gym_name | String | |
| is_on_classpass | Boolean | |
| website_link | String | |
| booking_url | String | |
| direct_phone | String | |
| direct_email | String | |
| instagram_link | String | |
| plungepalz_discount | String | |
| discount_verified | Boolean | |
| cold_plunge_details | List[Map] | |
| sauna_details | List[Map] | |

### cold_plunge_details Item Schema

| Field | Type |
|-------|------|
| temp_range_f | List[Number] | e.g. [38, 45] |
| capacity | Number |
| indoor_outdoor | String |
| notes | String |

### sauna_details Item Schema

| Field | Type |
|-------|------|
| temp_range_f | List[Number] |
| type | String | e.g. "infrared", "traditional" |
| capacity | Number |
| indoor_outdoor | String |
| notes | String |

### Sample Places_Places Record

```json
{
  "place_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "submission_id": "sub-abc-123",
  "h3_r7": "871f1a469ffffff",
  "h3_r5": "851f1a46fffffff",
  "h3_r4": "841f1a467ffffff",
  "lat": 40.7608,
  "lng": -111.8910,
  "place_name": "Plunge Lab",
  "place_type": "business",
  "visibility": "public",
  "place_slug": "plunge-lab-salt-lake-city-34567890",
  "address": "457 E 300 S, Salt Lake City, UT 84111",
  "city": "Salt Lake City",
  "state_province": "UT",
  "country": "USA",
  "activity_types": ["cold_plunge", "sauna"],
  "description": "A dedicated cold plunge and sauna studio in downtown SLC.",
  "place_type_metadata": {
    "hours_of_operation": "Mon-Sat 6am-9pm",
    "experience_type": "Hybrid",
    "access_type": "pay",
    "entry_fee_usd": 25,
    "membership_available": true,
    "walk_ins_allowed": true,
    "cold_plunge_details": [
      {
        "id": 1,
        "temp_range_f": [38, 45], 
        "capacity": 2, 
        "indoor_outdoor": "indoor",
        "brand_id": "b_000001",
        "additional_details": "This cold plunge is perfect for couples!"
      }
    ],
    "sauna_details": [
      {
        "id": 1, 
        "type": "infrared", 
        "temp_range_f": [140, 160], 
        "brand_id": "b_000311", 
        "capacity": 4
      }
    ]
  },
  "amenities": ["wifi", "lockers", "towels"],
  "has_plungepalz_discount": true,
  "place_website_url": "https://plungelab.com",
  "use_google_places_api_data": true,
  "google_places_api_data": {},
  "latest_google_places_refresh": "2025-02-20T12:00:00Z",
  "images": [],
  "cover_image": null,
  "header_image": null,
  "internal_status": "in_review",
  "internal_verified": false,
  "external_reporting": [],
  "total_plunge_sessions_recorded": 0,
  "total_sauna_sessions_recorded": 0,
  "external_ratings_ai_generated": {
    "classpass": {
        "count_string": "100+",
        "rating_score": 4.9
    },
    "google": {
        "count_string": "94",
        "rating_score": 4.7
    }
  },
  "tags": ["downtown", "studio", "membership"],
  "ts_created": "2025-02-20T12:00:00Z",
  "ts_last_updated": "2025-02-20T12:00:00Z"
}
```

---

## Places_Submissions

**PK:** `submission_id` (String)  
**Purpose:** Draft submissions and verification state before places are created.

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| submission_id | String | Primary key (e.g. `sub_` + UUID) |
| submitted_ts | String | ISO timestamp UTC when submission was created |
| submission_display_name | String | User's display name (e.g. "Jake Morrison") |
| email_six_digit_code | String \| null | Email verification code (6 alphanumeric) |
| sms_six_digit_code | String \| null | SMS verification code (6 alphanumeric) |
| submitted_via | String | mobile_app \| web_app \| admin_seed |
| email_type | String \| null | "email" or "username" — how submitter is identified |
| email_type_value | String \| null | Email address or PlungePalz username |
| phone_number | String \| null | Submitter's phone (E.164 format) |
| verified | Boolean | Email + SMS verified |
| verified_ts | String \| null | ISO timestamp UTC when verified |
| place_id_generated | String \| null | Set after AI autofill success; null if not yet generated |
| ai_autofill_result | Map | Output from generate_place_with_ai |
| original_submission_record_json | Map | User-submitted place data |

### original_submission_record_json

Contains: `place_name`, `place_type`, `activity_types`, `address`, `lat`, `lng`, `country`, `state_province`, `city`, `description`, `place_website_url`, `place_type_metadata`. For nature places, `address` may be null when `lat`/`lng` are provided.

### ai_autofill_result

Contains: `place_id`, `description`, `place_type_metadata`, `amenities`, `tags`, `external_ratings_ai_generated` (Google / ClassPass scores when present), `google_places_api_data`, `ai_errors`, `generated_ts`.

### Sample Records

**Mobile App User (verified, place generated):**
```json
{
  "submission_id": "sub_9f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "submitted_ts": "2026-02-23T14:32:10Z",
  "submission_display_name": "Jake Morrison",
  "email_six_digit_code": "49F9S4",
  "sms_six_digit_code": "F239S4",
  "submitted_via": "mobile_app",
  "email_type": "email",
  "email_type_value": "jake.morrison@gmail.com",
  "phone_number": "+18015550192",
  "verified": true,
  "verified_ts": "2026-02-23T14:34:55Z",
  "place_id_generated": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ai_autofill_result": {},
  "original_submission_record_json": {
    "place_name": "Cold Plunge Coffee",
    "place_type": "business",
    "lat": 40.7607,
    "lng": -111.8743,
    "country": "US",
    "state_province": "UT",
    "city": "Salt Lake City",
    "address": "457 E 300 S, Suite D, Salt Lake City, UT 84111",
    "description": "The world's first triple contrast café combining commercial-grade Blue Cube cold plunges (38–56°F), a traditional cedar Finnish sauna with aromatherapy, and specialty espresso from Seattle-based Hyacinth Coffee. No time limits on your stay.",
    "activity_types": ["cold_plunge", "sauna"],
    "place_website_url": "https://www.coldplungecoffee.com",
    "place_type_metadata": {
      "hours_of_operation": {
        "mon": "07:00-19:00",
        "tue": "07:00-19:00",
        "wed": "07:00-19:00",
        "thu": "07:00-19:00",
        "fri": "07:00-19:00",
        "sat": "07:00-15:00",
        "sun": "09:00-15:00"
      },
      "access_type": "pay",
      "entry_fee_usd": 25.00,
      "walk_ins_allowed": true,
      "place_phone": "+12069206147"
    }
  }
}
```

**Web App User (unverified, abandoned):**
```json
{
  "submission_id": "sub_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "submitted_ts": "2026-02-20T09:15:42Z",
  "submission_display_name": "Sarah K.",
  "email_six_digit_code": "7XQ2P1",
  "sms_six_digit_code": null,
  "submitted_via": "web_app",
  "email_type": "username",
  "email_type_value": "sarah_plunges",
  "phone_number": null,
  "verified": false,
  "verified_ts": null,
  "place_id_generated": null,
  "ai_autofill_result": {},
  "original_submission_record_json": {
    "place_name": "Silver Lake - Brighton Resort",
    "place_type": "nature",
    "lat": 40.5974,
    "lng": -111.5853,
    "country": "US",
    "state_province": "UT",
    "city": "Brighton",
    "address": null,
    "description": "Beautiful alpine lake at 8,740 ft elevation. Snow-fed and ice cold year round. Stunning mountain views.",
    "activity_types": ["cold_plunge"],
    "place_website_url": null,
    "place_type_metadata": {
      "time_of_season": [6, 7, 8, 9],
      "access_type": "parking_fee",
      "nature_type": "lake",
      "entry_fee_usd": 10.00,
      "hike_info": {
        "required": true,
        "submitter_generated": {
          "length_out_and_back_mi": 4.6,
          "elevation_gain_ft": 1423,
          "estimated_round_trip_time_hrs": 3.5,
          "difficulty": "moderate"
        },
        "AllTrailsLink": "https://www.alltrails.com/trail/us/utah/silver-lake-trail?u=i&sh=ns4ldx"
      },
      "additional_comments": "Park at the Brighton Resort lot. Trail starts at the south end near the ski lodge."
    }
  }
}
```

**Admin Seed:**
```json
{
  "submission_id": "sub_admin_seed_001",
  "submitted_ts": "2026-02-23T00:00:00Z",
  "submission_display_name": "PlungePalz Admin",
  "email_six_digit_code": null,
  "sms_six_digit_code": null,
  "submitted_via": "admin_seed",
  "email_type": null,
  "email_type_value": "admin@plungepalz.com",
  "phone_number": null,
  "verified": true,
  "verified_ts": "2026-02-23T00:00:00Z",
  "place_id_generated": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ai_autofill_result": {},
  "original_submission_record_json": {}
}
```

---

## Places_RatingsComments

**PK:** `place_id` (String)  
**SK:** `ts_created` (String, ISO timestamp UTC)  
**Purpose:** User ratings and comments per place.

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| place_id | String | Partition key |
| ts_created | String | Sort key, ISO timestamp UTC |
| user_id | String | PlungePalz user or anonymous ID |
| rating | Number | 1.0–5.0 |
| comment | String | Optional text |
| activity_type | String | cold_plunge \| sauna |

### Sample Record

```json
{
  "place_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ts_created": "2025-02-20T14:30:00Z",
  "user_id": "user_abc",
  "rating": 4.5,
  "comment": "Great facility, cold plunge was perfectly maintained.",
  "activity_type": "cold_plunge"
}
```

---

## Places_ClaimedAudit

**PK:** `place_id` (String)  
**SK:** `ts_claimed` (String, ISO timestamp UTC)  
**Purpose:** Claim history and status per place.

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| place_id | String | Partition key |
| ts_claimed | String | Sort key, ISO timestamp UTC |
| claimer_email | String | |
| claimer_phone | String | |
| claimer_name | String | |
| status | String | in_review \| approved \| revoked \| verified \| rejected |
| stripe_payment_intent_id | String | For $9.99 fee |
| reviewed_ts | String | Admin review ISO timestamp UTC |
| reviewed_by | String | Admin identifier |

### Status Options

- **in_review:** Awaiting PlungePalz approval  
- **approved:** Claimer can use Places_Edit  
- **rejected:** Claim rejected  
- **revoked:** Claim revoked  
- **verified:** Place has been verified

### Sample Records

```json
{
  "place_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ts_claimed": "2025-02-21T09:00:00Z",
  "claimer_email": "owner@plungelab.com",
  "claimer_phone": "+1234567890",
  "claimer_name": "Jane Doe",
  "status": "in_review",
  "stripe_payment_intent_id": "pi_xxx"
}
```

```json
{
  "place_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ts_claimed": "2025-02-21T09:00:00Z",
  "claimer_email": "owner@plungelab.com",
  "claimer_phone": "+1234567890",
  "claimer_name": "Jane Doe",
  "status": "approved",
  "stripe_payment_intent_id": "pi_xxx",
  "reviewed_ts": "2025-02-22T10:00:00Z",
  "reviewed_by": "admin_user_1"
}
```
