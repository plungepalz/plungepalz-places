import type { ActivityType, MapBounds, PlaceSearchResult, PlaceType } from './types';
import { formatBbox } from './types';

export interface LocalPlaceFilters {
  q?: string;
  bounds: MapBounds | null;
  placeTypes: PlaceType[];
  activityTypes: ActivityType[];
  approvedOnly?: boolean;
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

function searchableText(place: PlaceSearchResult): string {
  return [place.place_name, place.city, place.state_province, place.country, place.postal_code, place.description]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

export function localPlaceMatchesFilters(place: PlaceSearchResult, filters: LocalPlaceFilters): boolean {
  if (filters.approvedOnly && !place.is_approved) return false;
  if (!matchesBbox(place, filters.bounds)) return false;
  if (filters.q) {
    if (!searchableText(place).includes(filters.q.toLowerCase())) return false;
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

/**
 * Keep the previous array when every item is the same reference so list memo
 * can skip 82 cards while the user types a filter or hovers a pin.
 */
export function reuseIfSamePlaceRefs(
  prev: PlaceSearchResult[] | null | undefined,
  next: PlaceSearchResult[]
): PlaceSearchResult[] {
  if (
    prev &&
    prev.length === next.length &&
    prev.length > 0 &&
    prev.every((place, index) => place === next[index])
  ) {
    return prev;
  }
  if (prev && prev.length === 0 && next.length === 0) return prev;
  return next;
}

/**
 * Keep previous place objects (and therefore React list keys / DOM nodes)
 * when the same place_id comes back in a new /search payload.
 */
export function reconcilePlacesById(
  prev: PlaceSearchResult[] | null | undefined,
  next: PlaceSearchResult[]
): PlaceSearchResult[] {
  if (!prev || prev.length === 0) return next;
  if (next.length === 0) return next;
  const prevById = new Map(prev.map((place) => [place.place_id, place]));
  let sameOrder = prev.length === next.length;
  const out = next.map((place, index) => {
    const kept = prevById.get(place.place_id);
    if (!kept) {
      sameOrder = false;
      return place;
    }
    if (sameOrder && kept !== prev[index]) sameOrder = false;
    return kept;
  });
  if (sameOrder) return prev;
  return out;
}

/** Model of React's keyed list: same place_id keeps the previous node. */
export function retainPlaceNodes<T>(
  prevNodes: Map<string, T>,
  nextIds: string[],
  create: (id: string) => T
): Map<string, T> {
  const next = new Map<string, T>();
  for (const id of nextIds) {
    next.set(id, prevNodes.get(id) ?? create(id));
  }
  return next;
}

export function placeCardKey(place: { place_id: string }): string {
  return place.place_id;
}
