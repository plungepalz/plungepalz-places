/** `left-4` (16px) + list `w-[min(100%-2rem,380px)]`. */
export const LIST_PANEL_RIGHT = 396;
/** Mapbox mercator world width in CSS pixels at zoom 0. */
export const MERCATOR_TILE_SIZE = 512;
export const WORLD_FIT_ZOOM_MAX = 1.3;
/** Empty Pacific between Hawaii (~-157) and Fiji/NZ (~170–178). */
export const PACIFIC_SEAM_LNG = -170;
/** Comfortable Worldwide center when one world fits in the visible gap. */
export const WORLDWIDE_COMFORT_LNG = -20;
export const WORLDWIDE_LAT = 20;

export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function mercatorWorldPx(zoom: number): number {
  return MERCATOR_TILE_SIZE * 2 ** zoom;
}

/** Left padding that lines the padded viewport up with the list’s right edge. */
export function listPanelRightEdge(canvasWidth: number): number {
  return Math.min(LIST_PANEL_RIGHT, Math.max(0, canvasWidth - 80));
}

/**
 * Mapbox will not zoom out past the point where one world is shorter than the
 * canvas (mercator world is square). At 900px height that floor is ~0.814.
 */
export function mapboxHeightMinZoom(canvasHeight: number): number {
  return Math.log2(Math.max(canvasHeight, 1) / MERCATOR_TILE_SIZE);
}

export interface WorldwideFraming {
  zoom: number;
  lng: number;
  lat: number;
  panelRight: number;
  rightPadding: number;
  worldPx: number;
  gap: number;
  overflow: boolean;
}

export const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Zoom and center for the Worldwide preset.
 * When the allowed world is wider than the visible gap (list on the left, and
 * optionally the details drawer on the right), put the world edge at lng -170
 * on the gap’s left edge. When the world fits, keep lng -20.
 */
export function worldwideFraming(
  canvasWidth: number,
  canvasHeight: number,
  insets?: { left?: number; right?: number }
): WorldwideFraming {
  const panelRight = insets?.left ?? listPanelRightEdge(canvasWidth);
  const rightPadding = insets?.right ?? 0;
  const gap = Math.max(canvasWidth - panelRight - rightPadding, 1);
  const heightMinZoom = mapboxHeightMinZoom(canvasHeight);
  const widthFitZoom = Math.log2(gap / MERCATOR_TILE_SIZE);
  const zoom = Math.max(heightMinZoom, Math.min(WORLD_FIT_ZOOM_MAX, widthFitZoom));
  const worldPx = mercatorWorldPx(zoom);
  const overflow = worldPx > gap + 1;
  const lng = overflow
    ? wrapLng(PACIFIC_SEAM_LNG + (gap / 2 / worldPx) * 360)
    : WORLDWIDE_COMFORT_LNG;
  return { zoom, lng, lat: WORLDWIDE_LAT, panelRight, rightPadding, worldPx, gap, overflow };
}

/**
 * mapbox-gl 3.33 `flyTo()` calls `stop()` first. If a flight is already running,
 * that fires `moveend` synchronously. A `once('moveend')` attached *before*
 * `flyTo` is consumed by the interrupt and never sees the new flight end.
 * Always call `flyTo` first, then attach the listener.
 */
export function flyToThenOnMoveend(
  map: {
    flyTo: (options: Record<string, unknown>) => unknown;
    once: (event: string, handler: () => void) => unknown;
  },
  options: Record<string, unknown>,
  onMoveend: () => void
): void {
  map.flyTo(options);
  map.once('moveend', onMoveend);
}

/** Screen X of a longitude when `centerLng` sits in the middle of the visible gap. */
export function lngToVisibleX(
  lng: number,
  centerLng: number,
  zoom: number,
  canvasWidth: number,
  panelRight = listPanelRightEdge(canvasWidth),
  rightPadding = 0
): number {
  const worldPx = mercatorWorldPx(zoom);
  const gap = Math.max(canvasWidth - panelRight - rightPadding, 1);
  const visibleCenterX = panelRight + gap / 2;
  return visibleCenterX + ((lng - centerLng) / 360) * worldPx;
}

/** World-copy screen X positions that can land in or near the canvas. */
export function lngScreenCopies(
  lng: number,
  centerLng: number,
  zoom: number,
  canvasWidth: number,
  panelRight = listPanelRightEdge(canvasWidth),
  rightPadding = 0
): number[] {
  const worldPx = mercatorWorldPx(zoom);
  const base = lngToVisibleX(lng, centerLng, zoom, canvasWidth, panelRight, rightPadding);
  return [base - worldPx, base, base + worldPx];
}
