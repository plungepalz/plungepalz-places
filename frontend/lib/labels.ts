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

export function formatLocation(city: string, stateProvince?: string): string {
  if (city && stateProvince) return `${city}, ${stateProvince}`;
  return city || 'Unknown location';
}
