import type {
  ActivityType,
  PlaceSearchResult,
  PlaceType,
  SubmitPlaceRequest,
  SubmitPlaceResponse,
} from './types';

export const PLACE_TYPE_VALUES: PlaceType[] = ['business', 'nature', 'temporary_pop_up', 'gym_amenity'];
export const ACTIVITY_TYPE_VALUES: ActivityType[] = ['cold_plunge', 'sauna'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface SubmitFormInput {
  place_name: string;
  place_type: string;
  activity_types: ActivityType[];
  lat: unknown;
  lng: unknown;
  address: string;
  description?: string;
  email: string;
}

export function validateSubmitPlace(input: SubmitFormInput): {
  details: Record<string, string>;
  payload?: SubmitPlaceRequest;
} {
  const details: Record<string, string> = {};
  const place_name = input.place_name.trim();
  if (!place_name) details.place_name = 'required';

  const place_type = input.place_type as PlaceType;
  if (!PLACE_TYPE_VALUES.includes(place_type)) {
    details.place_type = 'must be one of business, nature, temporary_pop_up, gym_amenity';
  }

  if (!Array.isArray(input.activity_types) || input.activity_types.length === 0) {
    details.activity_types = 'must be a non-empty subset of cold_plunge, sauna';
  } else if (input.activity_types.some((activity) => activity !== 'cold_plunge' && activity !== 'sauna')) {
    details.activity_types = 'must be a non-empty subset of cold_plunge, sauna';
  }

  const lat = parseCoordinate(input.lat);
  const lng = parseCoordinate(input.lng);
  if (lat == null || lat < -90 || lat > 90) details.lat = 'must be a number between -90 and 90';
  if (lng == null || lng < -180 || lng > 180) details.lng = 'must be a number between -180 and 180';

  const address = input.address.trim();
  if (place_type !== 'nature' && !address) {
    details.address = 'required unless place_type is nature';
  }

  const email = input.email.trim();
  if (email && !EMAIL_RE.test(email)) details.email = 'must be a valid email';

  if (Object.keys(details).length > 0) return { details };

  const payload: SubmitPlaceRequest = {
    place_name,
    place_type,
    activity_types: input.activity_types,
    lat: lat!,
    lng: lng!,
  };
  if (address) payload.address = address;
  const description = input.description?.trim();
  if (description) payload.description = description;
  if (email) payload.email = email;
  return { details: {}, payload };
}

export function inferLocationFromAddress(address?: string): {
  city: string;
  state_province: string;
  country: string;
} {
  if (!address) return { city: '', state_province: '', country: '' };
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      city: parts[parts.length - 3] ?? '',
      state_province: parts[parts.length - 2] ?? '',
      country: parts[parts.length - 1] ?? '',
    };
  }
  if (parts.length === 2) return { city: parts[0] ?? '', state_province: parts[1] ?? '', country: '' };
  return { city: parts[0] ?? '', state_province: '', country: '' };
}

export function buildOptimisticPlace(data: SubmitPlaceRequest, response: SubmitPlaceResponse): PlaceSearchResult {
  const inferred = inferLocationFromAddress(data.address);
  return {
    place_id: response.place_id,
    place_slug: response.place_slug,
    place_name: data.place_name,
    place_type: data.place_type,
    address: data.address ?? '',
    city: inferred.city,
    state_province: inferred.state_province,
    country: inferred.country,
    activity_types: data.activity_types,
    description: data.description ?? '',
    cover_image: null,
    lat: data.lat,
    lng: data.lng,
    is_approved: false,
    ts_created: new Date().toISOString(),
  };
}
