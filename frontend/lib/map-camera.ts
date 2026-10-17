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
  worldPx: number;
  gap: number;
  overflow: boolean;
}

/**
 * Zoom and center for the Worldwide preset.
 * When the allowed world is wider than the gap right of the list (typical at
 * 1280×900), put the world edge at lng -170 on the panel’s right edge.
 * When the world fits in the gap (1440×900), keep lng -20.
 */
export function worldwideFraming(canvasWidth: number, canvasHeight: number): WorldwideFraming {
  const panelRight = listPanelRightEdge(canvasWidth);
  const gap = Math.max(canvasWidth - panelRight, 1);
  const heightMinZoom = mapboxHeightMinZoom(canvasHeight);
  const widthFitZoom = Math.log2(gap / MERCATOR_TILE_SIZE);
  const zoom = Math.max(heightMinZoom, Math.min(WORLD_FIT_ZOOM_MAX, widthFitZoom));
  const worldPx = mercatorWorldPx(zoom);
  const overflow = worldPx > gap + 1;
  const lng = overflow
    ? wrapLng(PACIFIC_SEAM_LNG + (gap / 2 / worldPx) * 360)
    : WORLDWIDE_COMFORT_LNG;
  return { zoom, lng, lat: WORLDWIDE_LAT, panelRight, worldPx, gap, overflow };
}

/** Screen X of a longitude when `centerLng` sits in the middle of the visible gap. */
export function lngToVisibleX(
  lng: number,
  centerLng: number,
  zoom: number,
  canvasWidth: number,
  panelRight = listPanelRightEdge(canvasWidth)
): number {
  const worldPx = mercatorWorldPx(zoom);
  const visibleCenterX = panelRight + (canvasWidth - panelRight) / 2;
  return visibleCenterX + ((lng - centerLng) / 360) * worldPx;
}

/** World-copy screen X positions that can land in or near the canvas. */
export function lngScreenCopies(
  lng: number,
  centerLng: number,
  zoom: number,
  canvasWidth: number,
  panelRight = listPanelRightEdge(canvasWidth)
): number[] {
  const worldPx = mercatorWorldPx(zoom);
  const base = lngToVisibleX(lng, centerLng, zoom, canvasWidth, panelRight);
  return [base - worldPx, base, base + worldPx];
}
