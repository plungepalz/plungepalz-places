import { resolveMapboxToken } from './mapbox-token';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

/**
 * Forward-geocode an address with Mapbox. Returns null when there is no token,
 * the request fails, or no feature is found — callers should skip gracefully.
 */
export async function geocodeAddress(address: string, token?: string): Promise<GeocodeResult | null> {
  const query = address.trim();
  const accessToken = resolveMapboxToken(token);
  if (!accessToken || !query) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: { center?: unknown }[] };
    const center = data.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
