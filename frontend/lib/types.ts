// PlungePalz Places API types

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

export interface SearchResponse {
  places: PlaceSearchResult[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface SearchParams {
  q?: string;
  bbox?: string; // minLng,minLat,maxLng,maxLat
  lat?: number;
  lng?: number;
  radius_km?: number;
  place_type?: string; // comma-separated
  activity_types?: string; // comma-separated
  approved_only?: boolean;
  limit?: number;
  page?: number;
}

export interface PlaceDetail extends PlaceSearchResult {
  // Full record includes everything from search plus potentially more fields
  // For now, using the search result shape as the base
  amenities?: string[];
  place_website_url?: string;
  tags?: string[];
}

export interface SubmitPlaceRequest {
  place_name: string;
  place_type: PlaceType;
  activity_types: ActivityType[];
  lat: number;
  lng: number;
  address?: string; // required unless nature
  description?: string;
  email?: string;
}

export interface SubmitPlaceResponse {
  submission_id: string;
  place_id: string;
  place_slug: string;
  is_approved: false;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
