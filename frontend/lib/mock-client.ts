import { PlacesApiError } from './errors';
import { MOCK_PLACE_DETAILS, MOCK_PLACES } from './mock-data';
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
      places = places.filter(
        (p) => p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat
      );
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

    const total = places.length;
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const page = Math.max(params.page ?? 0, 0);
    const start = page * limit;
    const paginatedPlaces = places.slice(start, start + limit);

    return {
      places: paginatedPlaces,
      total,
      page,
      limit,
      has_more: start + limit < total,
    };
  }

  async getPlace(placeId: string): Promise<PlaceDetail> {
    await new Promise((resolve) => setTimeout(resolve, 160));

    const submitted = submittedPlaces.find((p) => p.place_id === placeId);
    if (submitted) {
      return { ...submitted, amenities: [], tags: [], images: [] };
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

    if (!data.place_name?.trim()) {
      throw new PlacesApiError('place_name is required', 'INVALID_BODY', 400, {
        error: { code: 'INVALID_BODY', message: 'place_name is required' },
      });
    }
    if (data.place_type !== 'nature' && !data.address?.trim()) {
      throw new PlacesApiError('address is required unless place_type is nature', 'INVALID_BODY', 400, {
        error: {
          code: 'INVALID_BODY',
          message: 'address is required unless place_type is nature',
        },
      });
    }
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      throw new PlacesApiError('lat and lng are required', 'INVALID_BODY', 400, {
        error: { code: 'INVALID_BODY', message: 'lat and lng are required' },
      });
    }

    const place_id = `place_${Date.now()}`;
    const place_slug = `${slugify(data.place_name)}-${Date.now()}`;
    const newPlace: PlaceSearchResult = {
      place_id,
      place_slug,
      place_name: data.place_name,
      place_type: data.place_type,
      address: data.address ?? '',
      city: '',
      state_province: '',
      country: '',
      activity_types: data.activity_types,
      description: data.description ?? '',
      cover_image: null,
      lat: data.lat,
      lng: data.lng,
      is_approved: false,
      created_ts: new Date().toISOString(),
    };
    submittedPlaces.push(newPlace);

    return {
      submission_id: `sub_${Date.now()}`,
      place_id,
      place_slug,
      is_approved: false,
    };
  }
}

export const mockClient = new MockApiClient();
