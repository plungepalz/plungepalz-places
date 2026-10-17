/** Copied from `.env.example`. Must not be sent to Mapbox. */
export const MAPBOX_TOKEN_PLACEHOLDER = 'pk.your_mapbox_token_here';

/**
 * Treat missing, blank, and `.env.example` placeholder values as no token
 * so the map placeholder renders instead of a failed Mapbox load.
 */
export function resolveMapboxToken(token?: string | null): string | undefined {
  const trimmed = token?.trim() ?? '';
  if (!trimmed || trimmed === MAPBOX_TOKEN_PLACEHOLDER) return undefined;
  return trimmed;
}
