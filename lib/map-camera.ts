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
/** List expand/collapse settle time before a follow-up `map.resize()`. */
export const LIST_EXPAND_RESIZE_MS = 220;

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
 * Height at which Mapbox can reach a width-fit Worldwide zoom.
 * Used when the live canvas is shortened so `log2(h/512)` does not sit above
 * `log2(w/512)`.
 */
export function worldwideMapHeightCap(canvasWidth: number, availableHeight: number): number {
  if (!isNarrowViewport(canvasWidth)) return availableHeight;
  return Math.min(availableHeight, canvasWidth);
}

/** Inset so edge clusters (r≈30) sit fully inside the canvas. */
export const WORLD_FIT_EDGE_PAD = 32;

/** Width-fit zoom with a little horizontal padding for edge clusters. */
export function narrowWidthFitZoom(canvasWidth: number): number {
  const fit = Math.max(canvasWidth - 2 * WORLD_FIT_EDGE_PAD, 1);
  return Math.log2(fit / MERCATOR_TILE_SIZE);
}

/** Narrow viewport whose width-fit zoom is below the full-height Mapbox clamp. */
export function needsLowZoomCanvas(width: number, height: number): boolean {
  if (!isNarrowViewport(width)) return false;
  return narrowWidthFitZoom(width) < mapboxHeightMinZoom(height) - 1e-9;
}

export interface CanvasBox {
  top: number;
  height: number;
}

/**
 * Canvas height that can still show `zoom` (≤ 512·2^zoom). Once zoom reaches
 * the full-container clamp the canvas is full-bleed. Pinned to the bottom so
 * attribution stays on the visible map / screen edge.
 */
export function canvasHeightForLiveZoom(zoom: number, containerHeight: number): number {
  const height = Math.max(containerHeight, 1);
  const clamp = mapboxHeightMinZoom(height);
  if (zoom >= clamp - 1e-9) return height;
  return Math.min(height, mercatorWorldPx(zoom));
}

/**
 * Shortened canvas is tied to the camera, not the Worldwide chip or the list.
 * Show/Hide list and a pan at the same zoom must not change this box.
 */
export function lowZoomCanvasLayout(viewport: SizeBox, zoom: number): CanvasBox {
  if (!isNarrowViewport(viewport.width)) {
    return { top: 0, height: Math.max(viewport.height, 1) };
  }
  const height = canvasHeightForLiveZoom(zoom, viewport.height);
  return { top: Math.max(0, viewport.height - height), height };
}

/** List open / fitTop must not remesasure or shrink the canvas. */
export function canvasLayoutIgnoresList(viewport: SizeBox, zoom: number): CanvasBox {
  return lowZoomCanvasLayout(viewport, zoom);
}

/** Pan keeps zoom and therefore the canvas height — never a camera jump. */
export function canvasLayoutAfterPan(
  viewport: SizeBox,
  zoom: number
): { layout: CanvasBox; zoom: number } {
  return { layout: lowZoomCanvasLayout(viewport, zoom), zoom };
}

export interface CanvasMachineState {
  viewport: SizeBox;
  /** Canvas is shortened so a sub-clamp zoom can land. */
  shortened: boolean;
  /** Programmatic flight in progress — never grow. */
  flightLocked: boolean;
  /** After unlock, grow once live zoom has reached the full-height clamp. */
  growArmed: boolean;
  /** Zoom the short canvas is sized for. */
  anchorZoom: number | null;
  box: CanvasBox;
}

export type CanvasMachineEvent =
  | { type: 'viewport'; viewport: SizeBox }
  | { type: 'prepareFlight'; targetZoom: number; viewport?: SizeBox }
  | { type: 'flightProgress'; zoom: number }
  | { type: 'flightEnd'; zoom: number }
  | { type: 'pan'; zoom: number }
  | { type: 'userZoom'; zoom: number }
  | { type: 'resizeNarrowFit'; viewport: SizeBox; targetZoom: number };

export function fullCanvasBox(viewport: SizeBox): CanvasBox {
  return { top: 0, height: Math.max(viewport.height, 1) };
}

export function createCanvasMachine(viewport: SizeBox): CanvasMachineState {
  return {
    viewport,
    shortened: false,
    flightLocked: false,
    growArmed: false,
    anchorZoom: null,
    box: fullCanvasBox(viewport),
  };
}

function withBox(state: CanvasMachineState): CanvasMachineState {
  if (!state.shortened || state.anchorZoom == null || !isNarrowViewport(state.viewport.width)) {
    return { ...state, shortened: false, anchorZoom: null, box: fullCanvasBox(state.viewport) };
  }
  return { ...state, box: lowZoomCanvasLayout(state.viewport, state.anchorZoom) };
}

/**
 * Hysteresis canvas: shrink *before* a low-target programmatic flight and
 * keep that height until a user zoom-in (or a high-target flight) reaches
 * the full-height clamp. Live zoom during a flight never grows the canvas.
 */
export function reduceCanvasMachine(
  state: CanvasMachineState,
  event: CanvasMachineEvent
): CanvasMachineState {
  switch (event.type) {
    case 'viewport': {
      if (!isNarrowViewport(event.viewport.width)) {
        return {
          ...state,
          viewport: event.viewport,
          shortened: false,
          flightLocked: false,
          growArmed: false,
          anchorZoom: null,
          box: fullCanvasBox(event.viewport),
        };
      }
      return withBox({ ...state, viewport: event.viewport });
    }
    case 'prepareFlight': {
      const viewport = event.viewport ?? state.viewport;
      const clamp = mapboxHeightMinZoom(viewport.height);
      const belowClamp = isNarrowViewport(viewport.width) && event.targetZoom < clamp - 1e-9;
      if (belowClamp) {
        return {
          viewport,
          shortened: true,
          flightLocked: true,
          growArmed: false,
          anchorZoom: event.targetZoom,
          box: lowZoomCanvasLayout(viewport, event.targetZoom),
        };
      }
      return {
        ...state,
        viewport,
        flightLocked: true,
        growArmed: state.shortened,
        box: state.shortened
          ? lowZoomCanvasLayout(viewport, state.anchorZoom ?? event.targetZoom)
          : fullCanvasBox(viewport),
      };
    }
    case 'flightProgress':
      return state;
    case 'flightEnd': {
      const unlocked = { ...state, flightLocked: false };
      const clamp = mapboxHeightMinZoom(state.viewport.height);
      if (state.growArmed && event.zoom >= clamp - 1e-9) {
        return {
          ...unlocked,
          shortened: false,
          growArmed: false,
          anchorZoom: null,
          box: fullCanvasBox(state.viewport),
        };
      }
      return withBox(unlocked);
    }
    case 'pan':
      return state;
    case 'userZoom': {
      if (state.flightLocked) return state;
      if (!state.shortened || !isNarrowViewport(state.viewport.width)) return state;
      const clamp = mapboxHeightMinZoom(state.viewport.height);
      if (event.zoom >= clamp - 1e-9) {
        return {
          ...state,
          shortened: false,
          growArmed: false,
          anchorZoom: null,
          box: fullCanvasBox(state.viewport),
        };
      }
      const grown = lowZoomCanvasLayout(state.viewport, event.zoom);
      if (grown.height > state.box.height) {
        return { ...state, anchorZoom: event.zoom, box: grown };
      }
      return state;
    }
    case 'resizeNarrowFit':
      return reduceCanvasMachine(
        { ...state, viewport: event.viewport },
        { type: 'prepareFlight', targetZoom: event.targetZoom, viewport: event.viewport }
      );
  }
}

/**
 * Re-apply Worldwide framing when the viewport *becomes* narrow enough that
 * width-fit sits below the height clamp (1280→768). Not after the user left
 * the preset, and not for other chips.
 */
export function shouldReapplyNarrowWorldwide(
  leftPreset: boolean,
  locationId: string,
  prev: SizeBox | null,
  next: SizeBox
): boolean {
  if (leftPreset || locationId !== 'worldwide' || !prev) return false;
  return !needsLowZoomCanvas(prev.width, prev.height) && needsLowZoomCanvas(next.width, next.height);
}

/** Pull a CSS color out of a Mapbox paint value (constant or expression). */
export function cssColorFromPaint(value: unknown): string | null {
  if (typeof value === 'string') {
    const v = value.trim();
    return v && v !== 'transparent' ? v : null;
  }
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const found = cssColorFromPaint(value[i]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Map water / background fill from the loaded style — not page beige.
 * Tries `water` then `background`.
 */
export function readMapWaterColor(
  getPaint: (layer: string, prop: string) => unknown
): string | null {
  const attempts: Array<[string, string]> = [
    ['water', 'fill-color'],
    ['water', 'background-color'],
    ['background', 'background-color'],
  ];
  for (const [layer, prop] of attempts) {
    try {
      const css = cssColorFromPaint(getPaint(layer, prop));
      if (css) return css;
    } catch {
      /* layer may be missing until the style loads */
    }
  }
  return null;
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
  forceCollapse = false,
  fitTop = 0
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
    top: exactZoom ? Math.max(0, fitTop) : Math.min(96, Math.floor(maxVertical * 0.25)),
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
 * User-initiated camera change vs a programmatic flight / resize.
 * Mapbox `moveend` sets `originalEvent` for drag / scroll / pinch.
 * Window resize and our own camera tags must never flip the chip to Map area.
 */
export function isUserMapMove(
  event: { originalEvent?: unknown } | null | undefined,
  flightTag?: string | null
): boolean {
  if (flightTag === 'resize' || flightTag === 'programmatic') return false;
  const orig = event?.originalEvent as { type?: string } | undefined;
  if (orig && (orig.type === 'resize' || orig.type === 'orientationchange')) return false;
  if (event?.originalEvent != null) return true;
  if (flightTag) return false;
  return false;
}

export interface MapResizeState {
  rafId: number | null;
}

/** Coalesce map.resize() to one call per animation frame. */
export function scheduleMapResize(
  map: { resize: () => void } | null | undefined,
  state: MapResizeState,
  raf: (cb: FrameRequestCallback) => number,
  cancel: (id: number) => void
): void {
  if (!map) return;
  if (state.rafId != null) cancel(state.rafId);
  state.rafId = raf(() => {
    state.rafId = null;
    map.resize();
  });
}

export interface SizeBox {
  width: number;
  height: number;
}

/**
 * Re-apply the active preset camera after a container / breakpoint change.
 * Never when the user has already left the preset (chip is Map area).
 */
export function shouldReapplyPresetOnSizeChange(
  leftPreset: boolean,
  prev: SizeBox | null,
  next: SizeBox
): boolean {
  if (leftPreset) return false;
  if (!prev) return false;
  return prev.width !== next.width || prev.height !== next.height;
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
  const narrowFullWidth = panelRight <= 0 && canvasWidth <= NARROW_VIEWPORT;
  const widthFitZoom = narrowFullWidth
    ? narrowWidthFitZoom(gap)
    : Math.log2(gap / MERCATOR_TILE_SIZE);
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
