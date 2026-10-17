import { apiClient } from './api-client';
import { mockClient } from './mock-client';
import type { PlacesClient } from './types';

function shouldUseMocks(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') return true;
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'false') return false;
  return !process.env.NEXT_PUBLIC_API_BASE_URL;
}

export const isMockMode = shouldUseMocks();
export const client: PlacesClient = isMockMode ? mockClient : apiClient;
