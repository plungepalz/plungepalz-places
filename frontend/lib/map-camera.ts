/** `left-4` (16px) + list `w-[min(100%-2rem,380px)]`. */
export const LIST_PANEL_RIGHT = 396;
/** Mapbox mercator world width in CSS pixels at zoom 0. */
export const MERCATOR_TILE_SIZE = 512;
export const WORLD_FIT_ZOOM_MIN = 0.5;
export const WORLD_FIT_ZOOM_MAX = 1.3;

/** Left padding that lines the padded viewport up with the list’s right edge. */
export function listPanelRightEdge(canvasWidth: number): number {
  return Math.min(LIST_PANEL_RIGHT, Math.max(0, canvasWidth - 80));
}

/** Zoom so one 360° world fits in the canvas to the right of the list. */
export function worldFitZoom(canvasWidth: number, panelRight = listPanelRightEdge(canvasWidth)): number {
  const visible = Math.max(canvasWidth - panelRight, 1);
  const fit = Math.log2(visible / MERCATOR_TILE_SIZE);
  return Math.min(WORLD_FIT_ZOOM_MAX, Math.max(WORLD_FIT_ZOOM_MIN, fit));
}

/** Screen X of a longitude when `centerLng` sits in the middle of the visible gap. */
export function lngToVisibleX(
  lng: number,
  centerLng: number,
  zoom: number,
  canvasWidth: number,
  panelRight = listPanelRightEdge(canvasWidth)
): number {
  const worldPx = MERCATOR_TILE_SIZE * 2 ** zoom;
  const visibleCenterX = panelRight + (canvasWidth - panelRight) / 2;
  return visibleCenterX + ((lng - centerLng) / 360) * worldPx;
}
