import type { ApiErrorBody } from './types';

export class PlacesApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: ApiErrorBody | null;
  readonly details?: Record<string, string>;

  constructor(message: string, code: string, status: number, body: ApiErrorBody | null = null) {
    super(message);
    this.name = 'PlacesApiError';
    this.code = code;
    this.status = status;
    this.body = body;
    this.details = body?.error.details ?? body?.error.fields;
  }
}

export function isPlacesApiError(error: unknown): error is PlacesApiError {
  return error instanceof PlacesApiError;
}
