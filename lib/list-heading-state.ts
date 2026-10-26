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

/**
 * Apply list + heading only when this response is still the latest.
 * `pending` is not enough: if the newest request settles first, a late
 * older response leaves `pending === false` and would overwrite the list.
 */
export function shouldApplySettledSearch(
  requestId: number,
  machine: Pick<ListHeadingMachine, 'requestId'>
): boolean {
  return requestId === machine.requestId;
}

/**
 * Header and list commit together, and only when the camera is idle.
 * A mid-flight response (or a stale id after a back-to-back chip) is held
 * or dropped so SLC → Worldwide → US cannot freeze on Salt Lake City.
 */
export function shouldCommitSearchUi(input: {
  requestId: number;
  machine: Pick<ListHeadingMachine, 'requestId'>;
  cameraBusy: boolean;
}): boolean {
  if (input.cameraBusy) return false;
  return shouldApplySettledSearch(input.requestId, input.machine);
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
