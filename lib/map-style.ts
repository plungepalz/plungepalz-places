import { BRAND } from './brand';

export const CLUSTER_COUNT_SMALL = 10;
export const CLUSTER_COUNT_LARGE = 50;

export const CLUSTER_RADIUS = { small: 16, medium: 22, large: 30 } as const;
export const PIN_ICON_SIZE = { default: 1, hover: 1.16, selected: 1.28 } as const;
export const PIN_HALO_RADIUS = { default: 0, hover: 8, selected: 12 } as const;
/** Extra list-header padding so the overlay filter row does not cover the title. */
export const FILTER_OVERLAY_HEADER_INSET = 52;

/** Green land, blue water, road and city labels — Mapbox Streets. */
export const MAPBOX_STREETS_STYLE = 'mapbox://styles/mapbox/streets-v12';
/** Label fade when tiles / symbols come in. */
export const MAP_FADE_DURATION_MS = 400;
/** Paint transition used with feature-state hover/selected. */
export const PAINT_TRANSITION = { duration: 180, delay: 0 } as const;
/**
 * streets-v12 label stack (bottom → top): road-label, poi-label,
 * settlement-*-label, country-label. We put every Places layer *above*
 * that stack. City names can tuck under a pin; a pin under "Chicago"
 * is the worse failure on a place-finding map.
 */
export const PLACES_LAYERS_ABOVE_LABELS = true;
export const PLACES_LAYERS_BEFORE_ID: string | undefined = undefined;

export const CLUSTER_SHADOW_TRANSLATE = [0, 2] as const;
export const PIN_SHADOW_TRANSLATE = [0, 3] as const;
export const PIN_STROKE = '#ffffff';

export type PinVisualState = 'default' | 'hover' | 'selected';

export interface MapLayerSpec {
  id: string;
  type: 'circle' | 'symbol';
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  beforeId?: string;
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

export const PIN_HALO_OPACITY_EXPRESSION = featureStateCase(0.16, 0.22, 0);

export const MUTED_MOTORWAY = '#c4b7a4';
export const MUTED_TRUNK = '#d2c6ae';
export const MUTED_ROAD_CASE = '#b3a894';

export function isMotorwayOrTrunkLayer(layerId: string): boolean {
  return /motorway|trunk/i.test(layerId);
}

export function mutedRoadColor(layerId: string): string {
  if (/case|casing/i.test(layerId)) return MUTED_ROAD_CASE;
  if (/trunk/i.test(layerId)) return MUTED_TRUNK;
  return MUTED_MOTORWAY;
}

export function muteMotorwayLayers(map: {
  getStyle: () => { layers?: Array<{ id: string; type?: string }> };
  getPaintProperty: (id: string, prop: 'line-color') => unknown;
  setPaintProperty: (id: string, prop: 'line-color', value: string) => unknown;
}): number {
  let changed = 0;
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'line' || !isMotorwayOrTrunkLayer(layer.id)) continue;
    try {
      if (map.getPaintProperty(layer.id, 'line-color') == null) continue;
      map.setPaintProperty(layer.id, 'line-color', mutedRoadColor(layer.id));
      changed += 1;
    } catch {
      /* layer may not accept line-color */
    }
  }
  return changed;
}

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
  const selected = options?.selectedPlaceId ?? null;
  // Hover is paint-only (feature-state). Do not filter the hover layer on
  // hoveredPlaceId — swapping filters remounts symbols and flickers.
  const highlightIds = highlightPlaceIds(null, selected);

  return [
    {
      id: 'cluster-shadow',
      type: 'circle',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': 'rgba(15, 23, 42, 0.28)',
        'circle-radius': stepByPointCount(
          CLUSTER_RADIUS.small + 3,
          CLUSTER_RADIUS.medium + 4,
          CLUSTER_RADIUS.large + 5
        ),
        'circle-blur': 0.65,
        'circle-translate': [...CLUSTER_SHADOW_TRANSLATE],
        'circle-opacity': 0.7,
      },
    },
    {
      id: 'clusters',
      type: 'circle',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': CLUSTER_COLOR_EXPRESSION,
        'circle-radius': CLUSTER_RADIUS_EXPRESSION,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': BRAND.clusterStroke,
        'circle-radius-transition': PAINT_TRANSITION,
        'circle-opacity-transition': PAINT_TRANSITION,
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
        'circle-stroke-width': 3.5,
        'circle-stroke-color': PIN_STROKE,
        'circle-opacity': 0.95,
        'circle-opacity-transition': PAINT_TRANSITION,
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
        'text-halo-width': 1,
      },
    },
    {
      id: 'pin-shadow',
      type: 'circle',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 8,
        'circle-color': 'rgba(15, 23, 42, 0.3)',
        'circle-blur': 0.7,
        'circle-translate': [...PIN_SHADOW_TRANSLATE],
        'circle-opacity': 0.55,
        'circle-opacity-transition': PAINT_TRANSITION,
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
        'circle-stroke-width': featureStateCase(2, 2.5, 0),
        'circle-stroke-color': PIN_STROKE,
        'circle-translate': [0, -10],
        'circle-radius-transition': PAINT_TRANSITION,
        'circle-opacity-transition': PAINT_TRANSITION,
        'circle-stroke-width-transition': PAINT_TRANSITION,
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
      paint: {
        'icon-halo-color': PIN_STROKE,
        'icon-halo-width': 0.6,
        'icon-halo-blur': 0.2,
      },
    },
    {
      id: 'unclustered-point-hover',
      type: 'symbol',
      filter: unclusteredBaseFilter(highlightIds),
      layout: {
        'icon-image': 'pin-place',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': PIN_ICON_SIZE.hover,
      },
      paint: {
        'icon-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        'icon-opacity-transition': PAINT_TRANSITION,
        'icon-halo-color': PIN_STROKE,
        'icon-halo-width': 0.8,
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
      paint: {
        'icon-halo-color': PIN_STROKE,
        'icon-halo-width': 1,
      },
    },
  ];
}

export interface PlacePoint {
  place_id: string;
  place_name?: string;
  lat: number;
  lng: number;
}

/** Stable signature so GeoJSON / setData stay put when only hover/filter UI changes. */
export function placesSourceSignature(places: PlacePoint[]): string {
  return places.map((place) => `${place.place_id}:${place.lng.toFixed(5)},${place.lat.toFixed(5)}`).join(';');
}

export function placesToGeoJSON(places: PlacePoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((place) => ({
      type: 'Feature' as const,
      id: place.place_id,
      properties: {
        place_id: place.place_id,
        place_name: place.place_name ?? '',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [place.lng, place.lat] as [number, number],
      },
    })),
  };
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
  return scrollDeltaToRevealChild(child, parent) !== 0;
}

/** Pixels to scroll the list so `child` is fully inside `parent`. 0 if already fully visible. */
export function scrollDeltaToRevealChild(
  child: { top: number; bottom: number },
  parent: { top: number; bottom: number }
): number {
  if (child.top >= parent.top && child.bottom <= parent.bottom) return 0;
  if (child.top < parent.top) return child.top - parent.top;
  return child.bottom - parent.bottom;
}

/** Viewport-clamped list body height so Show/Hide never animates to content (~5k px). */
export function placesListMaxHeightPx(viewportHeight: number, chromeTop: number, gap = 16): number {
  return Math.max(viewportHeight - chromeTop - gap, 160);
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export function scrollPlaceCardIntoView(placeId: string | null | undefined, parent: HTMLElement | null): boolean {
  if (!placeId || !parent) return false;
  const child = parent.querySelector<HTMLElement>(`[data-place-id="${cssEscape(placeId)}"]`);
  if (!child) return false;
  const delta = scrollDeltaToRevealChild(child.getBoundingClientRect(), parent.getBoundingClientRect());
  if (delta === 0) return false;
  parent.scrollBy({ top: delta, behavior: 'smooth' });
  return true;
}

export function syncMapHoveredCard(root: ParentNode | null, placeId: string | null): void {
  if (!root) return;
  root.querySelectorAll('[data-place-card][data-map-hover="true"]').forEach((node) => {
    node.removeAttribute('data-map-hover');
  });
  if (!placeId) return;
  root.querySelector(`[data-place-id="${cssEscape(placeId)}"]`)?.setAttribute('data-map-hover', 'true');
}
