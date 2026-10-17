export type PlaceType = 'business' | 'nature' | 'temporary_pop_up' | 'gym_amenity';
export type ActivityType = 'cold_plunge' | 'sauna';

export interface PlaceSearchResult {
  place_id: string;
  place_slug: string;
  place_name: string;
  place_type: PlaceType;
  address: string;
  city: string;
  state_province: string;
  country: string;
  activity_types: ActivityType[];
  description: string;
  cover_image: string | null;
  lat: number;
  lng: number;
  is_approved: boolean;
  created_ts: string;
}

export interface PlaceDetail extends PlaceSearchResult {
  amenities?: string[];
  tags?: string[];
  place_website_url?: string | null;
  images?: Array<{ url: string; alt?: string }>;
  header_image?: string | null;
  has_plungepalz_discount?: boolean;
  place_type_metadata?: Record<string, unknown>;
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

export function formatBbox(bounds: MapBounds): string {
  return `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
}
