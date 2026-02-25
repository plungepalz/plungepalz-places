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
| place_slug | String | `{name}-{city}` hyphenated lowercase |
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
| internal_status | String | in_review \| active \| rejected |
| internal_comments | String | Admin notes |
| internal_verified | Boolean | Manual verification flag |
| internal_verified_ts | String | ISO timestamp UTC |
| external_reporting | List[Map] | Abuse/duplicate reports |
| total_plunge_sessions_recorded | Number | Counter |
| total_sauna_sessions_recorded | Number | Counter |
| external_ratings_ai_generated | Map | AI-generated ratings summary |
| tags | List[String] | Discovery tags |
| ts_created | String | ISO timestamp UTC |
| ts_last_updated | String | ISO timestamp UTC |
| claimed_ts | String | Empty or ISO timestamp UTC |

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
  "place_slug": "plunge-lab-salt-lake-city",
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
    "cold_plunge_details": [{"temp_range_f": [38, 45], "capacity": 2, "indoor_outdoor": "indoor"}],
    "sauna_details": [{"type": "infrared", "temp_range_f": [140, 160], "capacity": 4}]
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
  "internal_comments": "",
  "internal_verified": false,
  "internal_verified_ts": "",
  "external_reporting": [],
  "total_plunge_sessions_recorded": 0,
  "total_sauna_sessions_recorded": 0,
  "external_ratings_ai_generated": {"google": 4.5, "overall": 4.3},
  "tags": ["downtown", "studio", "membership"],
  "ts_created": "2025-02-20T12:00:00Z",
  "ts_last_updated": "2025-02-20T12:00:00Z",
  "claimed_ts": ""
}
```

---

## Places_Submissions

**PK:** `submission_id` (String, UUID v4)  
**Purpose:** Draft submissions and verification state before places are created.

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| submission_id | String | UUID v4, primary key |
| source | String | mobile_app \| web_app \| admin_seed |
| verified | Boolean | Email + SMS verified |
| verified_ts | String | ISO timestamp UTC |
| place_id_generated | String | Set after AI autofill success |
| original_submission_record_json | Map | User-submitted data |
| ai_autofill_result | Map | Output from generate_place_with_ai |
| ts_created | String | ISO timestamp UTC |
| ts_last_updated | String | ISO timestamp UTC |

### original_submission_record_json

Contains: `place_name`, `place_type`, `activity_types`, `address`, `latitude`, `longitude`, `identity`, `email`, `phone_number`.

### ai_autofill_result

Contains: `place_id`, `description`, `place_type_metadata`, `amenities`, `tags`, `external_ratings_ai_generated`, `google_places_api_data`, `ai_errors`, `generated_ts`.

### Sample Records

**Mobile App User:**
```json
{
  "submission_id": "sub-mobile-001",
  "source": "mobile_app",
  "verified": true,
  "verified_ts": "2025-02-20T11:30:00Z",
  "place_id_generated": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "original_submission_record_json": {
    "place_name": "Plunge Lab",
    "place_type": "business",
    "activity_types": ["cold_plunge", "sauna"],
    "address": "457 E 300 S, Salt Lake City, UT 84111",
    "identity": {"type": "username", "value": "user_123"},
    "email": "user@example.com",
    "phone_number": "+1234567890"
  },
  "ai_autofill_result": { "place_id": "a1b2c3d4-...", "description": "...", "place_type_metadata": {}, "generated_ts": "2025-02-20T12:00:00Z" },
  "ts_created": "2025-02-20T11:00:00Z",
  "ts_last_updated": "2025-02-20T12:00:00Z"
}
```

**Web App User:**
```json
{
  "submission_id": "sub-web-002",
  "source": "web_app",
  "verified": false,
  "verified_ts": "",
  "place_id_generated": "",
  "original_submission_record_json": {
    "place_name": "Mountain Creek",
    "place_type": "nature",
    "activity_types": ["cold_plunge"],
    "latitude": 40.5,
    "longitude": -111.8,
    "identity": {"type": "email", "value": "visitor@example.com"},
    "email": "visitor@example.com",
    "phone_number": "+1987654321"
  },
  "ts_created": "2025-02-20T10:00:00Z",
  "ts_last_updated": "2025-02-20T10:00:00Z"
}
```

**Admin Seed:**
```json
{
  "submission_id": "sub-admin-003",
  "source": "admin_seed",
  "verified": true,
  "verified_ts": "2025-02-19T00:00:00Z",
  "place_id_generated": "admin-place-001",
  "original_submission_record_json": { "place_name": "Seed Location", "place_type": "business", "address": "..." },
  "ai_autofill_result": {},
  "ts_created": "2025-02-19T00:00:00Z",
  "ts_last_updated": "2025-02-19T00:00:00Z"
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
| status | String | in_review \| approved \| blocked |
| stripe_payment_intent_id | String | For $9.99 fee |
| reviewed_ts | String | Admin review ISO timestamp UTC |
| reviewed_by | String | Admin identifier |

### Status Options

- **in_review:** Awaiting PlungePalz approval  
- **approved:** Claimer can use Places_Edit  
- **blocked:** Claim rejected or revoked  

### Sample Records

```json
{
  "place_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ts_claimed": "2025-02-21T09:00:00Z",
  "claimer_email": "owner@plungelab.com",
  "claimer_phone": "+1234567890",
  "claimer_name": "Jane Doe",
  "status": "in_review",
  "stripe_payment_intent_id": "pi_xxx",
  "reviewed_ts": "",
  "reviewed_by": ""
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
