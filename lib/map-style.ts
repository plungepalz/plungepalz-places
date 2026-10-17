import { BRAND } from './brand';

export const CLUSTER_COUNT_SMALL = 10;
export const CLUSTER_COUNT_LARGE = 50;

export const CLUSTER_RADIUS = { small: 16, medium: 22, large: 30 } as const;
export const PIN_ICON_SIZE = { default: 1, hover: 1.16, selected: 1.28 } as const;
export const PIN_HALO_RADIUS = { default: 0, hover: 14, selected: 18 } as const;

export type PinVisualState = 'default' | 'hover' | 'selected';

/** Mapbox `step` on `point_count`: <10, <50, 50+. */
export function stepByPointCount<T>(low: T, mid: T, high: T): unknown[] {
  return ['step', ['get', 'point_count'], low, CLUSTER_COUNT_SMALL, mid, CLUSTER_COUNT_LARGE, high];
}

export const CLUSTER_RADIUS_EXPRESSION = stepByPointCount(
  CLUSTER_RADIUS.small,
  CLUSTER_RADIUS.medium,
  CLUSTER_RADIUS.large
);

export const CLUSTER_COLOR_EXPRESSION = stepByPointCount(
  BRAND.clusterSmall,
  BRAND.clusterMedium,
  BRAND.clusterLarge
);

export const CLUSTER_TEXT_SIZE_EXPRESSION = stepByPointCount(11, 12, 14);

export function clusterRadiusForCount(count: number): number {
  if (count >= CLUSTER_COUNT_LARGE) return CLUSTER_RADIUS.large;
  if (count >= CLUSTER_COUNT_SMALL) return CLUSTER_RADIUS.medium;
  return CLUSTER_RADIUS.small;
}

export function clusterColorForCount(count: number): string {
  if (count >= CLUSTER_COUNT_LARGE) return BRAND.clusterLarge;
  if (count >= CLUSTER_COUNT_SMALL) return BRAND.clusterMedium;
  return BRAND.clusterSmall;
}

export function pinVisualState(
  placeId: string,
  hoveredPlaceId: string | null,
  selectedPlaceId: string | null
): PinVisualState {
  if (selectedPlaceId === placeId) return 'selected';
  if (hoveredPlaceId === placeId) return 'hover';
  return 'default';
}

export function pinIconSize(state: PinVisualState): number {
  return PIN_ICON_SIZE[state];
}

export function pinHaloRadius(state: PinVisualState): number {
  return PIN_HALO_RADIUS[state];
}

export function pinImageForState(state: PinVisualState): 'pin-place' | 'pin-place-active' {
  return state === 'selected' ? 'pin-place-active' : 'pin-place';
}

/** Feature-state expressions so hover/selected updates do not rebuild GeoJSON. */
export function featureStateCase(hoverValue: number, selectedValue: number, fallback: number): unknown[] {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    selectedValue,
    ['boolean', ['feature-state', 'hover'], false],
    hoverValue,
    fallback,
  ];
}

export const PIN_ICON_SIZE_EXPRESSION = featureStateCase(
  PIN_ICON_SIZE.hover,
  PIN_ICON_SIZE.selected,
  PIN_ICON_SIZE.default
);

export const PIN_HALO_RADIUS_EXPRESSION = featureStateCase(
  PIN_HALO_RADIUS.hover,
  PIN_HALO_RADIUS.selected,
  PIN_HALO_RADIUS.default
);

export const PIN_IMAGE_EXPRESSION = [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  'pin-place-active',
  'pin-place',
] as unknown[];

export function clusterLeafHasPlace(
  leaves: Array<{ properties?: { place_id?: string } | null; place_id?: string }>,
  placeId: string | null | undefined
): boolean {
  if (!placeId) return false;
  return leaves.some((leaf) => (leaf.properties?.place_id ?? leaf.place_id) === placeId);
}

export function shouldScrollChildIntoView(
  child: { top: number; bottom: number },
  parent: { top: number; bottom: number }
): boolean {
  return child.top < parent.top || child.bottom > parent.bottom;
}
