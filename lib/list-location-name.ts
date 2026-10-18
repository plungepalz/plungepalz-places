import type { LocationPreset } from './locations';

/** Viewport is tight enough that naming a city is reasonable. */
export const CITY_SCALE_ZOOM = 9;
/** Viewport shows most of the globe; never name a city here. */
export const WORLD_SCALE_ZOOM = 2.5;

/**
 * Area label for "{n} places in {label}".
 * The chip and header stay in lockstep: Map area → "this area";
 * a preset chip always uses that preset's name (never a zoom-based guess).
 */
export function locationChipLabel(location: LocationPreset, leftPreset: boolean): string {
  return leftPreset ? 'Map area' : location.label;
}

export function listLocationName({
  location,
  leftPreset = false,
}: {
  location: LocationPreset;
  /** True after a user-initiated pan/zoom away from the selected preset. */
  leftPreset?: boolean;
}): string {
  // Chip "Map area" and header "in this area" are the same state, at any zoom.
  if (leftPreset) return 'this area';
  // Still on a preset: always use the chip name, even when the API city
  // field does not match (e.g. New York / Brooklyn) or there is only one place.
  return location.id === 'worldwide' ? 'the world' : location.label;
}
