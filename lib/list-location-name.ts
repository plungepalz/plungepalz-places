import type { LocationPreset } from './locations';
import type { PlaceSearchResult } from './types';

/** Viewport is tight enough that naming a city is reasonable. */
export const CITY_SCALE_ZOOM = 9;
/** Viewport shows most of the globe; never name a city here. */
export const WORLD_SCALE_ZOOM = 2.5;
/** At city-scale zoom, name a city only when it actually dominates the list. */
const CITY_CONCENTRATION_SHARE = 0.7;
/** At regional/country zoom, only name a city when it covers almost all results. */
const MAJORITY_SHARE = 0.8;

/**
 * Area label for "{n} places in {label}".
 * Names a city only when the viewport or the result set is actually that city;
 * never picks the most common city from a mixed worldwide/country view.
 */
export function listLocationName({
  hasMap,
  zoom,
  places,
  location,
}: {
  hasMap: boolean;
  zoom: number | null;
  places: Pick<PlaceSearchResult, 'city'>[];
  location: LocationPreset;
}): string {
  if (!hasMap || zoom == null) {
    return location.id === 'worldwide' ? 'the world' : location.label;
  }

  if (zoom < WORLD_SCALE_ZOOM) {
    return 'the world';
  }

  const dominant = dominantCity(places);
  if (dominant) {
    const cityScale =
      zoom >= CITY_SCALE_ZOOM && dominant.share >= CITY_CONCENTRATION_SHARE && dominant.count >= 2;
    const majority = dominant.count >= 2 && dominant.share >= MAJORITY_SHARE;
    if (cityScale || majority) {
      return dominant.city;
    }
  }

  if (location.id === 'worldwide') {
    return 'this area';
  }

  // City chips must not label results that are somewhere else (user panned away).
  if (location.zoom >= CITY_SCALE_ZOOM) {
    if (dominant && dominant.city === location.label && dominant.share >= CITY_CONCENTRATION_SHARE) {
      return location.label;
    }
    return 'this area';
  }

  return location.label;
}

function dominantCity(places: Pick<PlaceSearchResult, 'city'>[]): {
  city: string;
  count: number;
  share: number;
} | null {
  if (places.length === 0) return null;
  const counts = new Map<string, number>();
  for (const place of places) {
    const city = place.city?.trim();
    if (!city) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [city, count] of counts) {
    if (count > bestCount) {
      best = city;
      bestCount = count;
    }
  }
  if (!best) return null;
  return { city: best, count: bestCount, share: bestCount / places.length };
}
