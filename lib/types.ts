export type PlaceType = 'business' | 'nature' | 'temporary_pop_up' | 'gym_amenity';
export type ActivityType = 'cold_plunge' | 'sauna';

export interface PlaceSearchResult {
  place_id: string;
  place_slug: string;
  place_name: string;
  place_type: PlaceType;
  /** Nature places from the API often have these location fields as null. */
  address: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  /**
   * Optional if a payload includes it. Live GET /search and GET /place do not
   * return postal_code for the MVP; mocks may set it so the drawer can show it.
   */
  postal_code?: string | null;
  activity_types: ActivityType[];
  description: string | null;
  cover_image: string | null;
  lat: number;
  lng: number;
  is_approved: boolean;
  ts_created: string;
}

export interface ExternalRatingsAiGenerated {
  classpass?: {
    count_string?: string;
    rating_score?: number;
    classpass_url?: string;
  };
  google?: {
    count_string?: string;
    rating_score?: number;
    google_business_url?: string;
  };
}

/** Flat public place record from GET /place/{place_id}. Optional fields may be omitted. */
export interface PlaceDetail extends PlaceSearchResult {
  place_website_url?: string | null;
  amenities?: string[];
  tags?: string[];
  place_type_metadata?: Record<string, unknown>;
  external_ratings_ai_generated?: ExternalRatingsAiGenerated;
  hours_of_operation?: string | null;
  ts_last_updated?: string | null;
}

export interface SearchResponse {
  places: PlaceSearchResult[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface SearchParams {
  q?: string;
  /** minLng,minLat,maxLng,maxLat — preferred over lat/lng/radius_km */
  bbox?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  /** Comma-separated PlaceType values */
  place_type?: string;
  /** Comma-separated ActivityType values (match any) */
  activity_types?: string;
  /** Default false. When true, only admin-approved places. */
  approved_only?: boolean;
  /** Default 100, max 500 */
  limit?: number;
  /** 0-based */
  page?: number;
}

export interface SubmitPlaceRequest {
  place_name: string;
  place_type: PlaceType;
  activity_types: ActivityType[];
  lat: number;
  lng: number;
  /** Required unless place_type is nature */
  address?: string;
  description?: string;
  email?: string;
}

export interface SubmitPlaceResponse {
  submission_id: string;
  place_id: string;
  place_slug: string;
  is_approved: false;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation on 400s, e.g. `{ "address": "required unless nature" }` */
    details?: Record<string, string>;
    /** Defensive alias; real API uses `details` */
    fields?: Record<string, string>;
  };
}

export type PlacesClient = {
  search(params: SearchParams): Promise<SearchResponse>;
  getPlace(placeId: string): Promise<PlaceDetail>;
  submitPlace(data: SubmitPlaceRequest): Promise<SubmitPlaceResponse>;
};

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface FlyRequest {
  nonce: number;
  longitude: number;
  latitude: number;
  zoom?: number;
  /**
   * Location chips/presets set this so the map may zoom out (e.g. Worldwide).
   * Card/pin flights omit it and keep the never-zoom-out Math.max behaviour.
   */
  exactZoom?: boolean;
  /** Padding-aware easeTo (map pin + drawer) — keep zoom, do not mark as a user pan. */
  ease?: boolean;
  keepZoom?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Wrap longitude into (-180, 180]. 180 itself becomes -180. */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Format a viewport as `minLng,minLat,maxLng,maxLat`.
 * Lat is clamped to [-90, 90]. Lng is wrapped, not clamped, so a box that
 * crosses the antimeridian is sent as minLng > maxLng (backend / mock split it).
 */
export function formatBbox(bounds: MapBounds): string {
  const minLat = clamp(bounds.minLat, -90, 90);
  const maxLat = clamp(bounds.maxLat, -90, 90);
  const lngSpan = bounds.maxLng - bounds.minLng;
  // Fully zoomed-out / wrapped worlds: Mapbox can report spans >= 360°.
  if (!Number.isFinite(lngSpan) || lngSpan >= 360) {
    return `-180,${minLat},180,${maxLat}`;
  }
  const minLng = wrapLng(bounds.minLng);
  let maxLng = wrapLng(bounds.maxLng);
  // wrap(180) is -180; keep a non-crossing raw box from collapsing to the west.
  if (bounds.maxLng > bounds.minLng && maxLng === -180) {
    maxLng = 180;
  }
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}
