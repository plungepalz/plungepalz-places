/** `left-4` (16px) + list `w-[min(100%-2rem,380px)]`. */
export const LIST_LEFT = 16;
export const LIST_WIDTH = 380;
export const LIST_PANEL_RIGHT = 396;
/** Right-side details / add-place drawer: 28rem. */
export const DRAWER_WIDTH = 448;
export const DRAWER_RIGHT = 16;
/** Drawer box plus `right-4`. */
export const DRAWER_OCCUPIED = 464;
/** Drawer occupancy + a 32px map gap used as flyTo right padding. */
export const PANEL_PADDING_RIGHT = 496;
export const MAP_CONTROL_SIZE = 40;
export const MAP_CONTROL_MARGIN = 16;
/** Minimum visible map strip between list and drawer (controls + gutters). */
export const MIN_MAP_STRIP = 96;
/** Mapbox mercator world width in CSS pixels at zoom 0. */
export const MERCATOR_TILE_SIZE = 512;
export const WORLD_FIT_ZOOM_MAX = 1.3;
/** Empty Pacific between Hawaii (~-157) and Fiji/NZ (~170–178). */
export const PACIFIC_SEAM_LNG = -170;
/** Comfortable Worldwide center when one world fits in the visible gap. */
export const WORLDWIDE_COMFORT_LNG = -20;
export const WORLDWIDE_LAT = 20;
/** Hide/collapse the list while framing Worldwide so the whole world can fit. */
export const NARROW_VIEWPORT = 768;

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

/** Drawer width plus `right-4`, never wider than the canvas minus side gutters. */
export function drawerOccupiedWidth(canvasWidth: number): number {
  return Math.min(DRAWER_OCCUPIED, Math.max(0, canvasWidth - 32));
}

/**
 * At 768px the 380px list and 28rem drawer cannot sit side by side.
 * Collapse the list while a panel is open so the map keeps a usable strip.
 * `forceCollapse` also hides the list (Worldwide on a narrow viewport).
 */
export function shouldCollapseList(
  canvasWidth: number,
  panelOpen: boolean,
  forceCollapse = false
): boolean {
  if (forceCollapse) return true;
  if (!panelOpen) return false;
  const listRight = listPanelRightEdge(canvasWidth);
  return canvasWidth - listRight - drawerOccupiedWidth(canvasWidth) < MIN_MAP_STRIP;
}

/** Collapse the list while the Worldwide preset is active on a narrow canvas. */
export function hideListForWorldwidePreset(
  canvasWidth: number,
  isWorldwide: boolean,
  leftPreset: boolean
): boolean {
  return isWorldwide && !leftPreset && canvasWidth <= NARROW_VIEWPORT;
}

export function isNarrowViewport(canvasWidth: number): boolean {
  return canvasWidth <= NARROW_VIEWPORT;
}

/** At ≤768, default every preset to the compact bar so the map can show its places. */
export function defaultCompactList(canvasWidth: number): boolean {
  return isNarrowViewport(canvasWidth);
}

/**
 * Cap the map canvas so Mapbox can actually reach a width-fit Worldwide zoom.
 * A 900–1024px-tall canvas floors zoom at ~0.81–1.0 no matter what minZoom is.
 */
export function worldwideMapHeightCap(canvasWidth: number, availableHeight: number): number {
  if (!isNarrowViewport(canvasWidth)) return availableHeight;
  return Math.min(availableHeight, canvasWidth);
}

/** Mapbox meters/pixel at zoom 0 on the equator, scaled by latitude. */
const MERCATOR_MPP_Z0 = 156543.03392804097;
/** 1440px window minus the floating list — desktop Worldwide/US design gap. */
const DESKTOP_PRESET_GAP = 1440 - LIST_PANEL_RIGHT;

/** Zoom that fits a radius (km) inside `pixels` of screen. */
export function zoomToFitRadiusKm(lat: number, radiusKm: number, pixels: number): number {
  const mpp = MERCATOR_MPP_Z0 * Math.cos((lat * Math.PI) / 180);
  const diameterM = Math.max(radiusKm, 1) * 2000;
  return Math.log2((mpp * Math.max(pixels, 1)) / diameterM);
}

/**
 * Camera for a location chip. Desktop (1280/1440) keeps the stored lat/lng/zoom
 * (Worldwide still uses worldwideFraming). At ≤768, zoom out so the preset
 * radius fits in the visible map — the compact list is not covering it.
 */
export function presetCamera(
  location: { id: string; lat: number; lng: number; zoom: number; radiusKm: number },
  canvasWidth: number,
  canvasHeight: number,
  insets?: { left?: number; right?: number }
): { zoom: number; lng: number; lat: number } {
  if (location.id === 'worldwide' || location.zoom <= WORLD_FIT_ZOOM_MAX) {
    const framing = worldwideFraming(canvasWidth, canvasHeight, insets);
    return { zoom: framing.zoom, lng: framing.lng, lat: framing.lat };
  }
  if (canvasWidth > NARROW_VIEWPORT) {
    return { zoom: location.zoom, lng: location.lng, lat: location.lat };
  }
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;
  const visW = Math.max(canvasWidth - left - right, 1);
  const visH = Math.max(canvasHeight, 1);
  const fitPx = Math.min(visW, visH) * 0.86;
  const radiusZoom = zoomToFitRadiusKm(location.lat, location.radiusKm, fitPx);
  const widthAdjusted = location.zoom + Math.log2(visW / DESKTOP_PRESET_GAP);
  return {
    zoom: Math.min(location.zoom, radiusZoom, widthAdjusted),
    lng: location.lng,
    lat: location.lat,
  };
}

export interface LayoutInsets {
  left: number;
  right: number;
  collapseList: boolean;
  listRight: number;
  drawerOccupied: number;
}

/** List / drawer occupancy used by flyTo padding, Worldwide framing, and chrome. */
export function layoutInsets(
  canvasWidth: number,
  panelOpen: boolean,
  forceCollapse = false
): LayoutInsets {
  const collapseList = shouldCollapseList(canvasWidth, panelOpen, forceCollapse);
  const listRight = collapseList ? 0 : listPanelRightEdge(canvasWidth);
  const drawerOccupied = panelOpen ? drawerOccupiedWidth(canvasWidth) : 0;
  const maxHorizontal = Math.max(0, canvasWidth - 80);
  let left = listRight;
  let right = 0;
  if (panelOpen) {
    right = Math.min(PANEL_PADDING_RIGHT, Math.max(0, canvasWidth - left - MIN_MAP_STRIP));
  }
  if (left + right > maxHorizontal && left + right > 0) {
    const scale = maxHorizontal / (left + right);
    left = Math.floor(left * scale);
    right = Math.floor(right * scale);
  }
  return { left, right, collapseList, listRight, drawerOccupied };
}

export function flyPadding(
  panelOpen: boolean,
  exactZoom: boolean | undefined,
  size: { width: number; height: number },
  forceCollapse = false
) {
  const insets = layoutInsets(size.width, panelOpen, forceCollapse);
  const maxVertical = Math.max(0, size.height - 80);
  let left = insets.left;
  let right = panelOpen
    ? insets.right
    : exactZoom
      ? 0
      : Math.min(56, Math.floor(Math.max(0, size.width - 80) * 0.45));
  if (exactZoom) {
    // Worldwide / location chips ignore the drawer so the list gap stays stable.
    right = 0;
    left = insets.listRight;
  }
  return {
    top: exactZoom ? 0 : Math.min(96, Math.floor(maxVertical * 0.25)),
    bottom: exactZoom ? 0 : Math.min(48, Math.floor(maxVertical * 0.15)),
    left,
    right,
  };
}

/** CSS `right` so zoom/locate sit in the visible map, clear of list and drawer. */
export function mapControlsRightPx(canvasWidth: number, panelOpen: boolean): number {
  if (!panelOpen) return MAP_CONTROL_MARGIN;
  const drawerLeft = canvasWidth - drawerOccupiedWidth(canvasWidth);
  return Math.max(MAP_CONTROL_MARGIN, canvasWidth - drawerLeft + MAP_CONTROL_MARGIN);
}

/** Horizontal center of the visible map strip (pin-drop hint). */
export function pinHintCenterX(canvasWidth: number, panelOpen: boolean, forceCollapse = false): number {
  const collapseList = shouldCollapseList(canvasWidth, panelOpen, forceCollapse);
  const left = collapseList ? 0 : listPanelRightEdge(canvasWidth);
  const right = panelOpen ? canvasWidth - drawerOccupiedWidth(canvasWidth) : canvasWidth;
  return (left + right) / 2;
}

/**
 * User-initiated camera change vs a programmatic flight.
 * Mapbox `moveend` sets `originalEvent` for drag / scroll / pinch.
 * Preset and place flights pass a flight tag and omit originalEvent.
 */
export function isUserMapMove(
  event: { originalEvent?: unknown } | null | undefined,
  flightTag?: string | null
): boolean {
  if (event?.originalEvent != null) return true;
  if (flightTag) return false;
  return false;
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

/** Camera timings. Preset flights still use retainPadding: false + clearPaddingKeepView. */
export const CAMERA_DURATION = {
  preset: 900,
  place: 760,
  cluster: 560,
  zoom: 220,
  locate: 900,
} as const;

/** Cubic ease-out: quick start, gentle settle. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/**
 * Zoom and center for the Worldwide preset.
 * When the allowed world is wider than the visible gap (list on the left, and
 * optionally the details drawer on the right), put the world edge at lng -170
 * on the gap’s left edge. When the world fits, keep lng -20.
 *
 * On a narrow full-width canvas (list collapsed at 768), allow zoom below the
 * Mapbox height floor so one world still fits in the gap. 1280/1440 keep the
 * height-min / comfort framing and antimeridian seam.
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
  const narrowFullWidth = panelRight <= 0 && canvasWidth <= NARROW_VIEWPORT;
  // Narrow full-width: size zoom to the canvas width so 360° fits, even when
  // the canvas is taller than one world (Mapbox height floor is ~0.814 at 900px).
  const minZoomFloor = narrowFullWidth ? 0 : heightMinZoom;
  const zoom = Math.max(minZoomFloor, Math.min(WORLD_FIT_ZOOM_MAX, widthFitZoom));
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
