import type { ApiErrorBody } from './types';

export class PlacesApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(message: string, code: string, status: number, body: ApiErrorBody | null = null) {
    super(message);
    this.name = 'PlacesApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export function isPlacesApiError(error: unknown): error is PlacesApiError {
  return error instanceof PlacesApiError;
}
