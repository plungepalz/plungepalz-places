import { PlacesApiError } from './errors';
import { MOCK_PLACE_DETAILS, MOCK_PLACES } from './mock-data';
import { inferLocationFromAddress, validateSubmitPlace } from './submit-validation';
import type {
  ActivityType,
  PlaceDetail,
  PlaceSearchResult,
  PlacesClient,
  PlaceType,
  SearchParams,
  SearchResponse,
  SubmitPlaceRequest,
  SubmitPlaceResponse,
} from './types';

/** Algolia pagination hard-stop. Hits past this offset are not retrievable. */
const SEARCH_HIT_CAP = 1000;

const submittedPlaces: PlaceSearchResult[] = [];

function allPlaces(): PlaceSearchResult[] {
  return [...MOCK_PLACES, ...submittedPlaces];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

class MockApiClient implements PlacesClient {
  async search(params: SearchParams): Promise<SearchResponse> {
    await new Promise((resolve) => setTimeout(resolve, 220));

    let places = allPlaces();

    if (params.q) {
      const query = params.q.toLowerCase();
      places = places.filter(
        (p) =>
          p.place_name.toLowerCase().includes(query) ||
          p.city.toLowerCase().includes(query) ||
          p.state_province.toLowerCase().includes(query) ||
          p.country.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    if (params.bbox) {
      const parts = params.bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
        throw new PlacesApiError('Invalid bbox. Expected minLng,minLat,maxLng,maxLat.', 'INVALID_BBOX', 400, {
          error: { code: 'INVALID_BBOX', message: 'Invalid bbox. Expected minLng,minLat,maxLng,maxLat.' },
        });
      }
      const [minLng, minLat, maxLng, maxLat] = parts;
      places = places.filter((p) => {
        const latInBox = p.lat >= minLat && p.lat <= maxLat;
        const lngInBox =
          minLng <= maxLng ? p.lng >= minLng && p.lng <= maxLng : p.lng >= minLng || p.lng <= maxLng;
        return latInBox && lngInBox;
      });
    } else if (params.lat !== undefined && params.lng !== undefined) {
      const radiusKm = params.radius_km ?? 10;
      places = places.filter((p) => haversineKm(params.lat!, params.lng!, p.lat, p.lng) <= radiusKm);
    }

    if (params.place_type) {
      const types = params.place_type.split(',').filter(Boolean) as PlaceType[];
      places = places.filter((p) => types.includes(p.place_type));
    }

    if (params.activity_types) {
      const activities = params.activity_types.split(',').filter(Boolean) as ActivityType[];
      places = places.filter((p) => p.activity_types.some((a) => activities.includes(a)));
    }

    if (params.approved_only) {
      places = places.filter((p) => p.is_approved);
    }

    places = [...places].sort((a, b) => (a.ts_created < b.ts_created ? 1 : a.ts_created > b.ts_created ? -1 : 0));

    const total = places.length;
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const page = Math.max(params.page ?? 0, 0);
    const start = page * limit;
    // Algolia cannot page past 1000 hits; has_more must go false at that cap.
    const retrievable = Math.min(total, SEARCH_HIT_CAP);
    const paginatedPlaces = places.slice(start, Math.min(start + limit, SEARCH_HIT_CAP));

    return {
      places: paginatedPlaces,
      total,
      page,
      limit,
      has_more: start + paginatedPlaces.length < retrievable,
    };
  }

  async getPlace(placeId: string): Promise<PlaceDetail> {
    await new Promise((resolve) => setTimeout(resolve, 160));

    const submitted = submittedPlaces.find((p) => p.place_id === placeId);
    if (submitted) {
      return { ...submitted };
    }

    const place = MOCK_PLACE_DETAILS[placeId];
    if (!place) {
      throw new PlacesApiError('Place not found', 'NOT_FOUND', 404, {
        error: { code: 'NOT_FOUND', message: 'Place not found' },
      });
    }
    return place;
  }

  async submitPlace(data: SubmitPlaceRequest): Promise<SubmitPlaceResponse> {
    await new Promise((resolve) => setTimeout(resolve, 280));

    const { details, payload } = validateSubmitPlace({
      place_name: data.place_name ?? '',
      place_type: data.place_type ?? '',
      activity_types: data.activity_types ?? [],
      lat: data.lat,
      lng: data.lng,
      address: data.address ?? '',
      description: data.description,
      email: data.email ?? '',
    });
    if (!payload) {
      throw new PlacesApiError('Invalid request body', 'INVALID_BODY', 400, {
        error: {
          code: 'INVALID_BODY',
          message: 'Invalid request body',
          details,
        },
      });
    }

    const place_id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `place_${Date.now()}`;
    const place_slug = `${slugify(payload.place_name)}-${Date.now()}`;
    const inferred = inferLocationFromAddress(payload.address);
    const newPlace: PlaceSearchResult = {
      place_id,
      place_slug,
      place_name: payload.place_name,
      place_type: payload.place_type,
      address: payload.address ?? '',
      city: inferred.city,
      state_province: inferred.state_province,
      country: inferred.country,
      activity_types: payload.activity_types,
      description: payload.description ?? '',
      cover_image: null,
      lat: payload.lat,
      lng: payload.lng,
      is_approved: false,
      ts_created: new Date().toISOString(),
    };
    submittedPlaces.push(newPlace);

    return {
      submission_id:
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sub_${Date.now()}`,
      place_id,
      place_slug,
      is_approved: false,
    };
  }
}

export const mockClient = new MockApiClient();
