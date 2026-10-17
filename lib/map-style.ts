import { BRAND } from './brand';

export const CLUSTER_COUNT_SMALL = 10;
export const CLUSTER_COUNT_LARGE = 50;

export const CLUSTER_RADIUS = { small: 16, medium: 22, large: 30 } as const;
export const PIN_ICON_SIZE = { default: 1, hover: 1.16, selected: 1.28 } as const;
export const PIN_HALO_RADIUS = { default: 0, hover: 14, selected: 18 } as const;
/** Extra list-header padding so the overlay filter row does not cover the title. */
export const FILTER_OVERLAY_HEADER_INSET = 52;

export type PinVisualState = 'default' | 'hover' | 'selected';

export interface MapLayerSpec {
  id: string;
  type: 'circle' | 'symbol';
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
}

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

export const CLUSTER_TEXT_COLOR_EXPRESSION = stepByPointCount(
  BRAND.clusterTextOnSmall,
  BRAND.clusterText,
  BRAND.clusterText
);

export const CLUSTER_TEXT_HALO_EXPRESSION = stepByPointCount(
  'rgba(255,255,255,0.7)',
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.35)'
);

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

export function clusterTextColorForCount(count: number): string {
  if (count >= CLUSTER_COUNT_SMALL) return BRAND.clusterText;
  return BRAND.clusterTextOnSmall;
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

/** Feature-state expressions — paint properties only. */
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

export const PIN_HALO_RADIUS_EXPRESSION = featureStateCase(
  PIN_HALO_RADIUS.hover,
  PIN_HALO_RADIUS.selected,
  PIN_HALO_RADIUS.default
);

export const PIN_HALO_OPACITY_EXPRESSION = featureStateCase(0.28, 0.36, 0);

export function unclusteredBaseFilter(excludeIds: string[] = []): unknown[] {
  if (excludeIds.length === 0) return ['!', ['has', 'point_count']];
  return ['all', ['!', ['has', 'point_count']], ['!', ['in', ['get', 'place_id'], ['literal', excludeIds]]]];
}

export function placeIdInFilter(ids: string[]): unknown[] {
  return ['all', ['!', ['has', 'point_count']], ['in', ['get', 'place_id'], ['literal', ids]]];
}

export function neverMatchPlaceFilter(): unknown[] {
  return ['==', ['get', 'place_id'], ''];
}

export function highlightPlaceIds(
  hoveredPlaceId: string | null | undefined,
  selectedPlaceId: string | null | undefined
): string[] {
  const ids = [hoveredPlaceId, selectedPlaceId].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export function placesMapLayerSpecs(options?: {
  hoveredPlaceId?: string | null;
  selectedPlaceId?: string | null;
  highlightedClusterId?: number | null;
}): MapLayerSpec[] {
  const hovered = options?.hoveredPlaceId ?? null;
  const selected = options?.selectedPlaceId ?? null;
  const highlightIds = highlightPlaceIds(hovered, selected);
  const hoverOnly = hovered && hovered !== selected ? [hovered] : [];

  return [
    {
      id: 'clusters',
      type: 'circle',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': CLUSTER_COLOR_EXPRESSION,
        'circle-radius': CLUSTER_RADIUS_EXPRESSION,
        'circle-stroke-width': 2,
        'circle-stroke-color': BRAND.clusterStroke,
      },
    },
    {
      id: 'cluster-highlight',
      type: 'circle',
      filter:
        options?.highlightedClusterId != null
          ? ['==', ['get', 'cluster_id'], options.highlightedClusterId]
          : ['==', ['get', 'cluster_id'], -1],
      paint: {
        'circle-color': BRAND.orangeSelected,
        'circle-radius': CLUSTER_RADIUS_EXPRESSION,
        'circle-stroke-width': 4,
        'circle-stroke-color': BRAND.orangeSoft,
        'circle-opacity': 0.95,
      },
    },
    {
      id: 'cluster-count',
      type: 'symbol',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': CLUSTER_TEXT_SIZE_EXPRESSION,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': CLUSTER_TEXT_COLOR_EXPRESSION,
        'text-halo-color': CLUSTER_TEXT_HALO_EXPRESSION,
        'text-halo-width': 0.75,
      },
    },
    {
      id: 'pin-halo',
      type: 'circle',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': PIN_HALO_RADIUS_EXPRESSION,
        'circle-color': BRAND.orange,
        'circle-opacity': PIN_HALO_OPACITY_EXPRESSION,
        'circle-translate': [0, -10],
      },
    },
    {
      id: 'unclustered-point',
      type: 'symbol',
      filter: unclusteredBaseFilter(highlightIds),
      layout: {
        'icon-image': 'pin-place',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': PIN_ICON_SIZE.default,
      },
    },
    {
      id: 'unclustered-point-hover',
      type: 'symbol',
      filter: hoverOnly.length > 0 ? placeIdInFilter(hoverOnly) : neverMatchPlaceFilter(),
      layout: {
        'icon-image': 'pin-place',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': PIN_ICON_SIZE.hover,
      },
    },
    {
      id: 'unclustered-point-selected',
      type: 'symbol',
      filter: selected ? placeIdInFilter([selected]) : neverMatchPlaceFilter(),
      layout: {
        'icon-image': 'pin-place-active',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': PIN_ICON_SIZE.selected,
      },
    },
  ];
}

export function expressionContainsFeatureState(value: unknown): boolean {
  if (value === 'feature-state') return true;
  if (Array.isArray(value)) return value.some(expressionContainsFeatureState);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(expressionContainsFeatureState);
  }
  return false;
}

function srgbChannel(value: number): number {
  const x = value / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const raw = hex.replace('#', '');
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;

export function clusterLabelPairs(): Array<{ count: number; fill: string; text: string }> {
  return [3, 10, 50].map((count) => ({
    count,
    fill: clusterColorForCount(count),
    text: clusterTextColorForCount(count),
  }));
}

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
