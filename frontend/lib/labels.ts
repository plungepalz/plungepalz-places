import type { ActivityType, PlaceType } from './types';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  sauna: 'Sauna',
  cold_plunge: 'Cold plunge',
};

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  business: 'Business',
  nature: 'Nature',
  temporary_pop_up: 'Pop-up',
  gym_amenity: 'Gym amenity',
};

export function formatPlaceType(placeType: PlaceType): string {
  return PLACE_TYPE_LABELS[placeType];
}

function present(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

/** City / state / country line. Empty when every part is null or blank (typical for nature places). */
export function formatLocation(
  city: string | null | undefined,
  stateProvince?: string | null,
  country?: string | null
): string {
  const cityPart = present(city);
  const statePart = present(stateProvince);
  const countryPart = present(country);
  const locality = [cityPart, statePart].filter(Boolean).join(', ');
  if (locality && countryPart) return `${locality} · ${countryPart}`;
  return locality || countryPart;
}
