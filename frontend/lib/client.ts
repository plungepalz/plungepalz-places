// PlungePalz Places client factory

import { apiClient } from './api-client';
import { mockClient } from './mock-client';

const USE_MOCK = !process.env.NEXT_PUBLIC_API_BASE_URL;

export const client = USE_MOCK ? mockClient : apiClient;
export const isMockMode = USE_MOCK;
