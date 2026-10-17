// Mock API client for local development

import {
  SearchParams,
  SearchResponse,
  PlaceDetail,
  SubmitPlaceRequest,
  SubmitPlaceResponse,
  PlaceSearchResult,
  ActivityType,
  PlaceType,
} from './types';
import { MOCK_PLACES, MOCK_PLACE_DETAILS } from './mock-data';

// Track submitted places in memory (mutable for in-memory state)
const submittedPlaces: PlaceSearchResult[] = [];

class MockApiClient {
  async search(params: SearchParams): Promise<SearchResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Combine mock and submitted places
    let places = [...MOCK_PLACES, ...submittedPlaces];

    // Apply filters
    if (params.q) {
      const query = params.q.toLowerCase();
      places = places.filter(
        p =>
          p.place_name.toLowerCase().includes(query) ||
          p.city.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    // Apply bbox filter (preferred)
    if (params.bbox) {
      const [minLng, minLat, maxLng, maxLat] = params.bbox.split(',').map(Number);
      places = places.filter(
        p =>
          p.lng >= minLng &&
          p.lng <= maxLng &&
          p.lat >= minLat &&
          p.lat <= maxLat
      );
    }
    // Fallback to radius filter
    else if (params.lat !== undefined && params.lng !== undefined) {
      const radiusKm = params.radius_km || 10;
      places = places.filter(p => {
        const distance = this.calculateDistance(
          params.lat!,
          params.lng!,
          p.lat,
          p.lng
        );
        return distance <= radiusKm;
      });
    }

    // Apply place_type filter
    if (params.place_type) {
      const types = params.place_type.split(',') as PlaceType[];
      places = places.filter(p => types.includes(p.place_type));
    }

    // Apply activity_types filter (match any)
    if (params.activity_types) {
      const activities = params.activity_types.split(',') as ActivityType[];
      places = places.filter(p =>
        p.activity_types.some(a => activities.includes(a))
      );
    }

    // Apply approved_only filter
    if (params.approved_only) {
      places = places.filter(p => p.is_approved);
    }

    const total = places.length;
    const limit = Math.min(params.limit || 100, 500);
    const page = params.page || 0;
    const start = page * limit;
    const end = start + limit;
    const paginatedPlaces = places.slice(start, end);
    const has_more = end < total;

    return {
      places: paginatedPlaces,
      total,
      page,
      limit,
      has_more,
    };
  }

  async getPlace(placeId: string): Promise<PlaceDetail> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check submitted places first
    const submittedPlace = submittedPlaces.find(p => p.place_id === placeId);
    if (submittedPlace) {
      return {
        ...submittedPlace,
        amenities: [],
        tags: [],
      };
    }

    const place = MOCK_PLACE_DETAILS[placeId];
    if (!place) {
      throw new Error('Place not found');
    }
    return place;
  }

  async submitPlace(data: SubmitPlaceRequest): Promise<SubmitPlaceResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const submission_id = `sub_${Date.now()}`;
    const place_id = `place_${Date.now()}`;
    const place_slug = `${data.place_name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    // Add to submitted places (not approved)
    const newPlace: PlaceSearchResult = {
      place_id,
      place_slug,
      place_name: data.place_name,
      place_type: data.place_type,
      address: data.address || '',
      city: 'Unknown',
      state_province: '',
      country: 'Unknown',
      activity_types: data.activity_types,
      description: data.description || '',
      cover_image: null,
      lat: data.lat,
      lng: data.lng,
      is_approved: false,
      created_ts: new Date().toISOString(),
    };

    submittedPlaces.push(newPlace);

    return {
      submission_id,
      place_id,
      place_slug,
      is_approved: false,
    };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export const mockClient = new MockApiClient();
