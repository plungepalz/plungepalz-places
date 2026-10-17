import { placesListHeading } from './list-heading';
import { listLocationName, locationChipLabel } from './list-location-name';
import type { LocationPreset } from './locations';
import type { PlaceSearchResult } from './types';

/** Settled list header + chip. Label and count always come from one search. */
export interface ListHeadingSnapshot {
  shown: number;
  total: number;
  locationName: string;
  chipLabel: string;
  hasMore: boolean;
}

export interface ListHeadingMachine {
  requestId: number;
  pending: boolean;
  heading: ListHeadingSnapshot | null;
}

export interface HeadingSearchContext {
  hasMap: boolean;
  zoom: number | null;
  location: LocationPreset;
  leftPreset: boolean;
}

export interface HeadingSearchResult {
  shown: number;
  total: number;
  hasMore: boolean;
  places: Pick<PlaceSearchResult, 'city'>[];
}

export function createListHeadingMachine(): ListHeadingMachine {
  return { requestId: 0, pending: false, heading: null };
}

/** Begin a search. Keeps the previous heading until the matching response settles. */
export function startListHeadingRequest(state: ListHeadingMachine): ListHeadingMachine {
  return {
    requestId: state.requestId + 1,
    pending: true,
    heading: state.heading,
  };
}

/**
 * Apply a search response only when `requestId` is still current.
 * Out-of-order / aborted responses leave the machine unchanged.
 */
export function settleListHeadingRequest(
  state: ListHeadingMachine,
  requestId: number,
  result: HeadingSearchResult,
  context: HeadingSearchContext
): ListHeadingMachine {
  if (requestId !== state.requestId) {
    return state;
  }
  const locationName = listLocationName({
    hasMap: context.hasMap,
    zoom: context.zoom,
    places: result.places,
    location: context.location,
    leftPreset: context.leftPreset,
  });
  return {
    requestId: state.requestId,
    pending: false,
    heading: {
      shown: result.shown,
      total: result.total,
      locationName,
      chipLabel: locationChipLabel(context.location, context.leftPreset),
      hasMore: result.hasMore,
    },
  };
}

export function listHeadingText(snapshot: ListHeadingSnapshot | null, extraCount = 0): string | null {
  if (!snapshot) return null;
  return placesListHeading(snapshot.shown + extraCount, snapshot.total + extraCount, snapshot.locationName, {
    hasMore: snapshot.hasMore,
  });
}

/** While on a preset, name the area from the chip zoom — not a stale camera zoom. */
export function headingZoomForSearch(
  leftPreset: boolean,
  mapZoom: number | null,
  location: LocationPreset
): number | null {
  return leftPreset ? mapZoom : location.zoom;
}

export function mapBoundsKey(bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null): string {
  if (!bounds) return '';
  return `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
}
