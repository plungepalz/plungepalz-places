import type { ActivityType, MapBounds, PlaceSearchResult, PlaceType } from './types';
import { formatBbox } from './types';

export interface LocalPlaceFilters {
  q?: string;
  bounds: MapBounds | null;
  placeTypes: PlaceType[];
  activityTypes: ActivityType[];
}

function matchesBbox(place: PlaceSearchResult, bounds: MapBounds | null): boolean {
  if (!bounds) return true;
  const parts = formatBbox(bounds).split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [minLng, minLat, maxLng, maxLat] = parts;
  const latInBox = place.lat >= minLat && place.lat <= maxLat;
  const lngInBox =
    minLng <= maxLng ? place.lng >= minLng && place.lng <= maxLng : place.lng >= minLng || place.lng <= maxLng;
  return latInBox && lngInBox;
}

export function localPlaceMatchesFilters(place: PlaceSearchResult, filters: LocalPlaceFilters): boolean {
  if (!matchesBbox(place, filters.bounds)) return false;
  if (filters.q) {
    const query = filters.q.toLowerCase();
    const haystack =
      `${place.place_name} ${place.city} ${place.state_province} ${place.country} ${place.description}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filters.placeTypes.length > 0 && !filters.placeTypes.includes(place.place_type)) return false;
  if (filters.activityTypes.length > 0 && !place.activity_types.some((activity) => filters.activityTypes.includes(activity))) {
    return false;
  }
  return true;
}

/**
 * Keep locally submitted places in the current view until /search returns them
 * (indexing is async on the real backend).
 */
export function mergeLocalPlaces(
  serverPlaces: PlaceSearchResult[],
  localPlaces: PlaceSearchResult[],
  filters: LocalPlaceFilters
): { places: PlaceSearchResult[]; extraCount: number } {
  const seen = new Set(serverPlaces.map((place) => place.place_id));
  const extras = localPlaces.filter((place) => !seen.has(place.place_id) && localPlaceMatchesFilters(place, filters));
  return { places: [...extras, ...serverPlaces], extraCount: extras.length };
}
