import { PlacesApiError } from './errors';
import type {
  ApiErrorBody,
  PlaceDetail,
  PlacesClient,
  SearchParams,
  SearchResponse,
  SubmitPlaceRequest,
  SubmitPlaceResponse,
} from './types';

function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
}

function parseErrorBody(data: unknown): ApiErrorBody | null {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    data.error &&
    typeof data.error === 'object' &&
    'code' in data.error &&
    'message' in data.error
  ) {
    const error = data.error as { code: unknown; message: unknown };
    return {
      error: {
        code: String(error.code),
        message: String(error.message),
      },
    };
  }
  return null;
}

class ApiClient implements PlacesClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
    } catch {
      throw new PlacesApiError('Network error talking to Places API', 'NETWORK_ERROR', 0);
    }

    let data: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new PlacesApiError(
          `Invalid JSON from Places API (${response.status})`,
          'INVALID_RESPONSE',
          response.status
        );
      }
    }

    if (!response.ok) {
      const body = parseErrorBody(data);
      throw new PlacesApiError(
        body?.error.message || `API error: ${response.status}`,
        body?.error.code || `HTTP_${response.status}`,
        response.status,
        body
      );
    }

    return data as T;
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();

    if (params.q) searchParams.set('q', params.q);
    if (params.bbox) {
      searchParams.set('bbox', params.bbox);
    } else {
      if (params.lat !== undefined) searchParams.set('lat', String(params.lat));
      if (params.lng !== undefined) searchParams.set('lng', String(params.lng));
      if (params.radius_km !== undefined) searchParams.set('radius_km', String(params.radius_km));
    }
    if (params.place_type) searchParams.set('place_type', params.place_type);
    if (params.activity_types) searchParams.set('activity_types', params.activity_types);
    if (params.approved_only !== undefined) {
      searchParams.set('approved_only', String(params.approved_only));
    }
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.page !== undefined) searchParams.set('page', String(params.page));

    const query = searchParams.toString();
    return this.request<SearchResponse>(query ? `/search?${query}` : '/search');
  }

  async getPlace(placeId: string): Promise<PlaceDetail> {
    return this.request<PlaceDetail>(`/place/${encodeURIComponent(placeId)}`);
  }

  async submitPlace(data: SubmitPlaceRequest): Promise<SubmitPlaceResponse> {
    return this.request<SubmitPlaceResponse>('/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(getApiBaseUrl());
