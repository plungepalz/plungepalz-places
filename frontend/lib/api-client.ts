// PlungePalz Places API client

import {
  SearchParams,
  SearchResponse,
  PlaceDetail,
  SubmitPlaceRequest,
  SubmitPlaceResponse,
  ApiError,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '';
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as ApiError;
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown API error');
    }
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();
    
    if (params.q) searchParams.append('q', params.q);
    if (params.bbox) searchParams.append('bbox', params.bbox);
    if (params.lat !== undefined) searchParams.append('lat', params.lat.toString());
    if (params.lng !== undefined) searchParams.append('lng', params.lng.toString());
    if (params.radius_km !== undefined) searchParams.append('radius_km', params.radius_km.toString());
    if (params.place_type) searchParams.append('place_type', params.place_type);
    if (params.activity_types) searchParams.append('activity_types', params.activity_types);
    if (params.approved_only !== undefined) searchParams.append('approved_only', params.approved_only.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
    if (params.page !== undefined) searchParams.append('page', params.page.toString());

    const query = searchParams.toString();
    const endpoint = query ? `/search?${query}` : '/search';
    
    return this.request<SearchResponse>(endpoint);
  }

  async getPlace(placeId: string): Promise<PlaceDetail> {
    return this.request<PlaceDetail>(`/place/${placeId}`);
  }

  async submitPlace(data: SubmitPlaceRequest): Promise<SubmitPlaceResponse> {
    return this.request<SubmitPlaceResponse>('/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
