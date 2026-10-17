import os
import re
import requests
import json
from pathlib import Path

# Load .env from backend root (searches script dir and cwd)
def _load_env():
    bases = [Path.cwd(), Path.cwd().parent, Path.cwd().parent.parent]
    if "__file__" in globals():
        script_dir = Path(__file__).resolve().parent
        bases = [script_dir.parent.parent, *bases]  # backend root when script is in tests/UnitTestingScripts/
    for base in bases:
        env_file = base / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k and v:
                        os.environ.setdefault(k, v)
            break

_load_env()

# ── Config ─────────────────────────────────────────────────────────────────
API_KEY  = os.getenv("GOOGLE_PLACES_API_KEY")
BASE_URL = "https://places.googleapis.com/v1"

if not API_KEY:
    raise SystemExit(
        "❌ GOOGLE_PLACES_API_KEY not found. Ensure .env exists in plungepalz-places-backend/ with GOOGLE_PLACES_API_KEY=..."
    )


# ── Core API Functions ──────────────────────────────────────────────────────

# ── Place Type Query Modifiers ──────────────────────────────────────────────
PLACE_TYPE_MODIFIERS = {
    "business":         "business",
    "nature":           "nature",
    "temporary_pop_up": "pop up event",
    "gym_amenity":      "gym amenity facility",
}

def search_and_get_details(place_name, lat, lng, radius=100.0, place_type=None):
    search_url = f"{BASE_URL}/places:searchText"
    search_headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress"
    }

    # Append place_type modifier to the query if provided
    if place_type and place_type in PLACE_TYPE_MODIFIERS:
        modifier   = PLACE_TYPE_MODIFIERS[place_type]
        text_query = f"{place_name} {modifier}"
    else:
        text_query = place_name
        if place_type:
            print(f"⚠️  Unknown place_type '{place_type}', ignoring. Valid options: {list(PLACE_TYPE_MODIFIERS.keys())}")

    search_payload = {
        "textQuery": text_query,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius
            }
        },
        "maxResultCount": 1
    }

    print(f"🔍 Searching for: '{text_query}' near {lat}, {lng} (place_type='{place_type}')...")
    search_response = requests.post(search_url, json=search_payload, headers=search_headers)
    search_data = search_response.json()

    if search_response.status_code != 200 or 'places' not in search_data:
        print(f"❌ Text Search failed: {search_data}")
        return None

    place    = search_data['places'][0]
    place_id = place['id']
    print(f"✅ Found: {place.get('displayName', {}).get('text', 'N/A')} (ID: {place_id})")

    field_mask = ",".join([
        "id", "displayName", "formattedAddress", "location",
        "rating", "userRatingCount", "photos", "websiteUri",
        "businessStatus", "regularOpeningHours",
        "nationalPhoneNumber", "internationalPhoneNumber", "types",
    ])

    details_response = requests.get(
        f"{BASE_URL}/places/{place_id}",
        headers={"X-Goog-Api-Key": API_KEY, "X-Goog-FieldMask": field_mask}
    )
    details_data = details_response.json()

    if details_response.status_code != 200:
        print(f"❌ Place Details failed: {details_data}")
        return None

    return details_data
# ── Helper Functions ────────────────────────────────────────────────────────

def get_business_thumbnail_image(google_response, thumbnail_size=600):
    """
    Strategy 1: Find first photo where authorAttributions.displayName matches
                the place's displayName.text (works for businesses).
    Strategy 2: Fallback to first image in enhanced_business_images (works for
                trails, parks, and any place without a Google Business Profile).
    """
    business_name = google_response.get("displayName", {}).get("text", "")
    photos        = google_response.get("photos", [])

    # Strategy 1: Business profile match
    for photo in photos:
        for attribution in photo.get("authorAttributions", []):
            if attribution.get("displayName", "").strip() == business_name.strip():
                photo_uri   = attribution.get("photoUri", "")
                resized_uri = re.sub(r's\d+(-[^/]+)?$', f's{thumbnail_size}', photo_uri)
                print(f"✅ Thumbnail: business profile match for '{business_name}'")
                return resized_uri

    # Strategy 2: Fallback to first place image
    fallback_images = get_business_images(google_response, max_height_px=thumbnail_size, max_width_px=thumbnail_size)
    if fallback_images:
        print(f"ℹ️  Thumbnail: no business profile match for '{business_name}', using first place photo as fallback")
        return fallback_images[0]

    print(f"⚠️  Thumbnail: no photos available at all for '{business_name}'")
    return None


def format_categories(types):
    """
    Format categories: filter out empty/invalid, exclude point_of_interest,
    replace underscores with spaces, capitalize each word, deduplicate.
    Returns comma-separated string or 'Location' if empty.
    """
    if not types or not isinstance(types, list):
        return "Location"

    filtered_out_categories = {"point_of_interest"}
    seen = set()
    result = []

    for type_str in types:
        if not type_str or not isinstance(type_str, str) or type_str.strip() == "":
            continue
        if type_str in filtered_out_categories:
            continue
        # Replace underscores with spaces, capitalize each word
        formatted = " ".join(
            word.capitalize() for word in type_str.replace("_", " ").split()
        )
        if formatted not in seen:
            seen.add(formatted)
            result.append(formatted)

    return ", ".join(result) if result else "Location"


def get_business_images(google_response, max_height_px=400, max_width_px=400):
    """
    Builds direct photo media URLs for every photo in the response,
    preserving the original order. Mirrors the React Native getPhotoUrl() logic.
    """
    photos = google_response.get("photos", [])
    image_urls = []

    for photo in photos:
        photo_name = photo.get("name")
        if photo_name:
            url = (
                f"{BASE_URL}/{photo_name}/media"
                f"?maxHeightPx={max_height_px}"
                f"&maxWidthPx={max_width_px}"
                f"&key={API_KEY}"
            )
            image_urls.append(url)

    return image_urls


def build_enhanced_response(google_response):
    """
    Takes the raw Google Places API response and returns an enhanced copy:
      - Removes 'photos' (raw metadata, not needed downstream)
      - Adds 'enhanced_business_thumbnail_uri'
      - Adds 'enhanced_business_images'
      - Adds 'enhanced_types' (formatted types string)
    """
    enhanced = {k: v for k, v in google_response.items() if k != "photos"}

    enhanced["enhanced_business_thumbnail_uri"] = get_business_thumbnail_image(
        google_response,
        thumbnail_size=600
    )

    enhanced["enhanced_business_images"] = get_business_images(
        google_response,
        max_height_px=900,
        max_width_px=900
    )

    enhanced["enhanced_types"] = format_categories(google_response.get("types", []))

    return enhanced


# ── Execution ───────────────────────────────────────────────────────────────
# test_place_type === "business", "nature", "temporary_pop_up", "gym_amenity"

if __name__ == "__main__":
    # Define unit test variables
    test_name, test_lat, test_lng, test_radius, test_place_type = "Cold Plunge Coffee", 40.763051, -111.877591, 200.0, "business"

    test_name, test_lat, test_lng, test_radius, test_place_type = "Silver Lake", 40.521115, -111.671838, 200.0, "nature"

    # 1. Raw API response
    google_search_response_json = search_and_get_details(
        test_name, test_lat, test_lng,
        radius=test_radius,
        place_type=test_place_type
    )

    if google_search_response_json:
        enhanced_google_search_data_json = build_enhanced_response(google_search_response_json)
        print("\n--- enhanced_google_search_data_json ---")
        print(json.dumps(enhanced_google_search_data_json, indent=2))
