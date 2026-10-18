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
/** Show/Hide max-height duration — keep in sync with `.places-list-body-wrap` in globals.css. */
export const LIST_EXPAND_MS = 280;
/** Follow-up `map.resize()` after the list expand/collapse transition settles. */
export const LIST_EXPAND_RESIZE_MS = LIST_EXPAND_MS + 20;

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
  | { type: 'userZoom'; zoom: number; prevZoom?: number }
  | { type: 'resizeNarrowFit'; viewport: SizeBox; targetZoom: number };

export function fullCanvasBox(viewport: SizeBox): CanvasBox {
  return { top: 0, height: Math.max(viewport.height, 1) };
}

export function canvasBoxEquals(a: CanvasBox, b: CanvasBox): boolean {
  return a.top === b.top && a.height === b.height;
}

/** True once the shrink-first box is committed — only then start the capped fly. */
export function canvasReadyForFlight(applied: CanvasBox, prepared: CanvasBox): boolean {
  return canvasBoxEquals(applied, prepared);
}

/**
 * Keep the measured map box (`data-map-canvas`) fixed. Offset the GL host with
 * a transform so Worldwide grow-back is not a layout shift.
 */
export function canvasHostStyle(box: CanvasBox): { height: number; transform: string } {
  return {
    height: box.height,
    transform: box.top === 0 ? 'none' : `translate3d(0, ${box.top}px, 0)`,
  };
}

/** Leftover band above a shortened canvas — ocean, never page beige or white. */
export function canvasFillStyle(
  box: CanvasBox,
  color: string
): { height: number; backgroundColor: string } | null {
  if (box.top <= 0) return null;
  return { height: box.top, backgroundColor: color };
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
      const prevZoom = event.prevZoom ?? event.zoom;
      // Zoom-out must never grow the canvas — stay short until a zoom-in
      // reaches the full-height clamp. Growing on the way out jumps the
      // map (top 177→0) and then Mapbox clamps the live zoom to ~0.814.
      if (event.zoom <= prevZoom + 1e-9) return state;
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

/**
 * After a shrink + `map.resize()`, the live zoom is often still the
 * full-height clamp (~0.814). Jump (or short ease) to the narrow width-fit
 * whenever Worldwide is still selected — every breakpoint shrink, not only
 * the first one.
 */
export function shouldJumpToNarrowWorldwideFit(
  leftPreset: boolean,
  locationId: string,
  viewport: SizeBox,
  liveZoom: number
): boolean {
  if (leftPreset || locationId !== 'worldwide') return false;
  if (!needsLowZoomCanvas(viewport.width, viewport.height)) return false;
  return liveZoom > narrowWidthFitZoom(viewport.width) + 1e-4;
}

/**
 * Post-`map.resize()` gate: only jump once the shortened canvas is on
 * screen. A width-only ResizeObserver tick can still see a 900px box.
 */
export function shouldApplyNarrowWorldwideAfterResize(input: {
  pending: boolean;
  leftPreset: boolean;
  locationId: string;
  viewport: SizeBox;
  canvasHeight: number;
  liveZoom: number;
}): boolean {
  if (!input.pending) return false;
  if (input.leftPreset || input.locationId !== 'worldwide') return false;
  if (input.canvasHeight >= input.viewport.height - 1) return false;
  return shouldJumpToNarrowWorldwideFit(
    input.leftPreset,
    input.locationId,
    input.viewport,
    input.liveZoom
  );
}

export type RgbaColor = [number, number, number, number];

function clampChannel(value: number, max = 255): number {
  return Math.min(max, Math.max(0, value));
}

function splitColorArgs(inner: string): string[] {
  const [main, alpha] = inner.split('/');
  const parts = main.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  if (alpha?.trim()) parts.push(alpha.trim());
  return parts;
}

function parseChannel(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('%')) {
    const pct = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * max : null;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseAlpha(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.endsWith('%')) {
    const pct = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(pct) ? clampChannel(pct / 100, 1) : null;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? clampChannel(n, 1) : null;
}

function parseHue(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(-?[\d.]+)(deg|rad|turn|grad)?$/);
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n)) return null;
  switch (match[2]) {
    case 'rad':
      return (n * 180) / Math.PI;
    case 'turn':
      return n * 360;
    case 'grad':
      return (n * 9) / 10;
    default:
      return n;
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = clampChannel(s, 1);
  const light = clampChannel(l, 1);
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const m = light - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (huePrime < 1) [r, g, b] = [chroma, x, 0];
  else if (huePrime < 2) [r, g, b] = [x, chroma, 0];
  else if (huePrime < 3) [r, g, b] = [0, chroma, x];
  else if (huePrime < 4) [r, g, b] = [0, x, chroma];
  else if (huePrime < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Parse a CSS / Mapbox color string to RGBA 0–255 / 0–1. */
export function parseCssColor(value: string): RgbaColor | null {
  const v = value.trim();
  if (!v || v.toLowerCase() === 'transparent') return null;
  if (v.charAt(0) === '#') {
    const hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return [r, g, b, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return [r, g, b, a];
    }
    return null;
  }
  const lower = v.toLowerCase();
  const rgb = lower.match(/^rgba?\(\s*([\s\S]+)\)$/);
  if (rgb) {
    const parts = splitColorArgs(rgb[1]);
    if (parts.length < 3) return null;
    const r = parseChannel(parts[0], 255);
    const g = parseChannel(parts[1], 255);
    const b = parseChannel(parts[2], 255);
    const a = parts[3] != null ? parseAlpha(parts[3]) : 1;
    if (r == null || g == null || b == null || a == null) return null;
    return [clampChannel(r), clampChannel(g), clampChannel(b), a];
  }
  const hsl = lower.match(/^hsla?\(\s*([\s\S]+)\)$/);
  if (hsl) {
    const parts = splitColorArgs(hsl[1]);
    if (parts.length < 3) return null;
    const h = parseHue(parts[0]);
    const s = parseChannel(parts[1], 1);
    const l = parseChannel(parts[2], 1);
    const a = parts[3] != null ? parseAlpha(parts[3]) : 1;
    if (h == null || s == null || l == null || a == null) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return [r, g, b, a];
  }
  return null;
}

export function formatCssRgb([r, g, b, a]: RgbaColor): string {
  const red = Math.round(clampChannel(r));
  const green = Math.round(clampChannel(g));
  const blue = Math.round(clampChannel(b));
  if (a < 1 - 1e-6) {
    const alpha = Math.round(clampChannel(a, 1) * 1000) / 1000;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return `rgb(${red}, ${green}, ${blue})`;
}

function interpolationT(kind: unknown, input: number, lower: number, upper: number): number {
  if (upper === lower) return 0;
  const linear = (input - lower) / (upper - lower);
  if (!Array.isArray(kind) || kind[0] !== 'exponential') return linear;
  const base = Number(kind[1]);
  if (!Number.isFinite(base) || base === 1) return linear;
  return (base ** (input - lower) - 1) / (base ** (upper - lower) - 1);
}

function evaluateNumber(value: unknown, zoom: number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value[0] === 'zoom') return zoom;
    if (value[0] === 'literal' && typeof value[1] === 'number') return value[1];
  }
  return null;
}

function lerpRgba(a: RgbaColor, b: RgbaColor, t: number): RgbaColor {
  const u = clampChannel(t, 1);
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u,
  ];
}

function rgbaFromPaint(value: unknown, zoom: number): RgbaColor | null {
  const css = evaluatePaintColor(value, zoom);
  return css ? parseCssColor(css) : null;
}

/**
 * Evaluate a Mapbox paint color (constant or zoom-interpolated expression)
 * at `zoom`. streets-v12 water is an `interpolate` on `["zoom"]`.
 */
export function evaluatePaintColor(value: unknown, zoom: number): string | null {
  if (typeof value === 'string') {
    const parsed = parseCssColor(value);
    return parsed ? formatCssRgb(parsed) : cssColorFromPaint(value);
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const op = value[0];
  if (op === 'literal') return evaluatePaintColor(value[1], zoom);
  if (op === 'to-color') return evaluatePaintColor(value[1], zoom);
  if (op === 'rgb' || op === 'rgba') {
    const r = evaluateNumber(value[1], zoom);
    const g = evaluateNumber(value[2], zoom);
    const b = evaluateNumber(value[3], zoom);
    const a = op === 'rgba' ? evaluateNumber(value[4], zoom) : 1;
    if (r == null || g == null || b == null || a == null) return null;
    return formatCssRgb([r, g, b, a]);
  }
  if (op === 'hsl' || op === 'hsla') {
    const h = evaluateNumber(value[1], zoom);
    const s = evaluateNumber(value[2], zoom);
    const l = evaluateNumber(value[3], zoom);
    const a = op === 'hsla' ? evaluateNumber(value[4], zoom) : 1;
    if (h == null || s == null || l == null || a == null) return null;
    const sat = s > 1 ? s / 100 : s;
    const light = l > 1 ? l / 100 : l;
    const [r, g, b] = hslToRgb(h, sat, light);
    return formatCssRgb([r, g, b, a]);
  }
  if (op === 'step') {
    const input = evaluateNumber(value[1], zoom);
    if (input == null || value.length < 3) return null;
    let chosen: unknown = value[2];
    for (let i = 3; i < value.length - 1; i += 2) {
      const stop = evaluateNumber(value[i], zoom);
      if (stop == null) continue;
      if (input >= stop) chosen = value[i + 1];
    }
    return evaluatePaintColor(chosen, zoom);
  }
  if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
    const input = evaluateNumber(value[2], zoom);
    if (input == null) return null;
    const stops: Array<{ stop: number; output: unknown }> = [];
    for (let i = 3; i < value.length - 1; i += 2) {
      const stop = evaluateNumber(value[i], zoom);
      if (stop == null) return null;
      stops.push({ stop, output: value[i + 1] });
    }
    if (stops.length === 0) return null;
    if (input <= stops[0].stop) return evaluatePaintColor(stops[0].output, zoom);
    const last = stops[stops.length - 1];
    if (input >= last.stop) return evaluatePaintColor(last.output, zoom);
    for (let i = 1; i < stops.length; i += 1) {
      if (input <= stops[i].stop) {
        const from = stops[i - 1];
        const to = stops[i];
        const t = interpolationT(value[1], input, from.stop, to.stop);
        const a = rgbaFromPaint(from.output, zoom);
        const b = rgbaFromPaint(to.output, zoom);
        if (!a || !b) return evaluatePaintColor(from.output, zoom);
        return formatCssRgb(lerpRgba(a, b, t));
      }
    }
    return evaluatePaintColor(last.output, zoom);
  }
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const found = evaluatePaintColor(value[i], zoom);
    if (found) return found;
  }
  return null;
}

/** Pull a CSS color out of a Mapbox paint value (constant or last expression stop). */
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
 * streets-v12 `water` fill-color is a constant light stop (153, 221, 255).
 * At Worldwide / low zoom the rendered Pacific is darker — measured
 * (105, 204, 255). Do not ReadPixels; that stalls the GPU.
 */
export const STREETS_LOW_ZOOM_OCEAN = 'rgb(105, 204, 255)';
/** water-depth in streets-v12 is active below zoom 8; darker ocean below 6. */
export const STREETS_LOW_ZOOM_OCEAN_MAX = 6;

/** Fill behind a shortened canvas: evaluate at zoom, then the low-zoom constant. */
export function resolveWaterFillCss(evaluated: string | null, zoom: number): string | null {
  if (zoom <= STREETS_LOW_ZOOM_OCEAN_MAX) return STREETS_LOW_ZOOM_OCEAN;
  return evaluated;
}

/**
 * Map water / background fill from the loaded style — not page beige.
 * Tries `water` then `background`. Pass `zoom` (`map.getZoom()`) so
 * zoom-interpolated water is evaluated at the current camera, and the
 * streets low-zoom ocean constant covers the Worldwide leftover band.
 */
export function readMapWaterColor(
  getPaint: (layer: string, prop: string) => unknown,
  zoom?: number
): string | null {
  const attempts: Array<[string, string]> = [
    ['water', 'fill-color'],
    ['water', 'background-color'],
    ['background', 'background-color'],
  ];
  for (const [layer, prop] of attempts) {
    try {
      const value = getPaint(layer, prop);
      const evaluated =
        zoom == null ? cssColorFromPaint(value) : evaluatePaintColor(value, zoom);
      const css = zoom == null ? evaluated : resolveWaterFillCss(evaluated, zoom);
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

export type FlightTag =
  | 'preset'
  | 'place'
  | 'drawer'
  | 'programmatic'
  | 'cluster'
  | 'zoom'
  | 'locate'
  | 'resize';

/** In-flight cameras — skip bbox search and viewport reports until the final moveend. */
export function isProgrammaticFlightTag(tag: string | null | undefined): boolean {
  return (
    tag === 'preset' ||
    tag === 'place' ||
    tag === 'drawer' ||
    tag === 'programmatic' ||
    tag === 'cluster' ||
    tag === 'zoom' ||
    tag === 'locate'
  );
}

export function shouldReportViewport(tag: string | null | undefined): boolean {
  return !isProgrammaticFlightTag(tag);
}

export type CameraPadding = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export function paddingIsZero(padding: CameraPadding | null | undefined): boolean {
  if (!padding) return true;
  return (
    (padding.top ?? 0) === 0 &&
    (padding.right ?? 0) === 0 &&
    (padding.bottom ?? 0) === 0 &&
    (padding.left ?? 0) === 0
  );
}

export interface PaddingClearMap {
  getPadding: () => CameraPadding;
  getCanvas: () => { clientWidth: number; clientHeight: number };
  unproject: (point: [number, number]) => { lng: number; lat: number };
  setCenter?: (center: [number, number]) => unknown;
  triggerRepaint?: () => void;
  jumpTo?: (options: Record<string, unknown>) => unknown;
  transform?: { padding?: CameraPadding };
}

/**
 * Drop leftover flyTo padding without a camera call. `setCenter` / `jumpTo`
 * are camera methods (Mapbox `setCenter` runs `jumpTo` internally).
 */
export function clearPaddingKeepView(map: PaddingClearMap): boolean {
  if (paddingIsZero(map.getPadding())) return false;
  if (map.transform) {
    map.transform.padding = { ...ZERO_PADDING };
  }
  map.triggerRepaint?.();
  return true;
}

/** Live container size after `map.resize()` — never a React width captured before the breakpoint. */
export function readMeasuredViewport(
  el: { clientWidth: number; clientHeight: number } | null | undefined,
  fallback?: SizeBox | null
): SizeBox | null {
  if (el && el.clientWidth >= 2 && el.clientHeight >= 2) {
    return { width: el.clientWidth, height: el.clientHeight };
  }
  return fallback ?? null;
}

export function mercatorYFromLat(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

export function mercatorLatFromY(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Mapbox padding puts `center` in the padded gap. Fly with zero padding to
 * the matching unpadded center so the visual stays and no follow-up jumpTo
 * / setCenter is required.
 */
export function unpaddedCenter(
  center: { lng: number; lat: number },
  zoom: number,
  padding: CameraPadding
): { lng: number; lat: number } {
  const dx = ((padding.left ?? 0) - (padding.right ?? 0)) / 2;
  const dy = ((padding.top ?? 0) - (padding.bottom ?? 0)) / 2;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { lng: center.lng, lat: center.lat };
  const worldPx = mercatorWorldPx(zoom);
  const lng = wrapLng(center.lng - (dx / worldPx) * 360);
  const lat = mercatorLatFromY(mercatorYFromLat(center.lat) - dy / worldPx);
  return { lng, lat };
}

/** Preset camera from the size measured after resize, folded into one unpadded fly. */
export function presetFlyCamera(
  location: { id: string; lat: number; lng: number; zoom: number; radiusKm: number },
  viewport: SizeBox,
  panelOpen = false
): { zoom: number; lng: number; lat: number } {
  const collapse = isNarrowViewport(viewport.width);
  const padding = flyPadding(panelOpen, true, viewport, collapse, 0);
  const framed = presetCamera(location, viewport.width, viewport.height, {
    left: padding.left,
    right: padding.right,
  });
  return { zoom: framed.zoom, ...unpaddedCenter(framed, framed.zoom, padding) };
}

export interface MapResizeState {
  rafId: number | null;
}

/** Coalesce map.resize() to one call per animation frame. */
export function scheduleMapResize(
  map: { resize: () => void } | null | undefined,
  state: MapResizeState,
  raf: (cb: FrameRequestCallback) => number,
  cancel: (id: number) => void,
  afterResize?: () => void
): void {
  if (!map) return;
  if (state.rafId != null) cancel(state.rafId);
  state.rafId = raf(() => {
    state.rafId = null;
    map.resize();
    afterResize?.();
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

/** Camera timings. flyTo always gets an explicit duration so long hops cannot run 6s. */
export const CAMERA_DURATION = {
  preset: 2000,
  place: 1500,
  placeShort: 560,
  cluster: 480,
  zoom: 220,
  locate: 1600,
  drawer: 520,
} as const;

export const CAMERA_DURATION_CAP = {
  placeMin: 1200,
  placeMax: 1800,
  presetMin: 900,
  presetMax: 2200,
} as const;

/** Gentle zoom curve. Duration is set separately so speed cannot stretch a US→Tempe hop. */
export const CAMERA_FLY = {
  curve: 1.2,
} as const;

export type CameraMethod = 'flyTo' | 'easeTo';
export type CameraMoveKind = 'preset' | 'place' | 'drawer';

/** Cubic ease-out: quick start, gentle settle. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function cameraFlyOptions(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    curve: CAMERA_FLY.curve,
    easing: easeOutCubic,
    ...partial,
  };
}

export function cameraEaseOptions(
  duration: number,
  partial: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    duration,
    easing: easeOutCubic,
    ...partial,
  };
}

export function isShortCameraHop(kind: 'preset' | 'place' | 'cluster' | 'zoom' | 'locate' | 'drawer'): boolean {
  return kind === 'cluster' || kind === 'zoom' || kind === 'drawer';
}

export function shortestLngDelta(from: number, to: number): number {
  return Math.abs(wrapLng(to - from));
}

/** Degrees + zoom so a local hop stays short and a continent hop still hits the cap. */
export function cameraSeparation(
  from: { lng: number; lat: number; zoom?: number },
  to: { lng: number; lat: number; zoom?: number }
): number {
  const zoomFrom = from.zoom ?? to.zoom ?? 0;
  const zoomTo = to.zoom ?? from.zoom ?? 0;
  return Math.hypot(shortestLngDelta(from.lng, to.lng), to.lat - from.lat) + Math.abs(zoomTo - zoomFrom) * 3;
}

export function isShortPlaceHop(separation: number): boolean {
  return separation < 2.5;
}

export function cappedFlyDuration(kind: 'preset' | 'place', separation: number): number {
  if (kind === 'preset') {
    return Math.min(
      CAMERA_DURATION_CAP.presetMax,
      Math.max(CAMERA_DURATION_CAP.presetMin, 900 + separation * 20)
    );
  }
  return Math.min(
    CAMERA_DURATION_CAP.placeMax,
    Math.max(CAMERA_DURATION_CAP.placeMin, 1200 + separation * 12)
  );
}

export function pickCameraAnimation(
  kind: CameraMoveKind,
  from: { lng: number; lat: number; zoom?: number },
  to: { lng: number; lat: number; zoom?: number }
): { method: CameraMethod; duration: number } {
  if (kind === 'drawer') {
    return { method: 'easeTo', duration: CAMERA_DURATION.drawer };
  }
  const separation = cameraSeparation(from, to);
  if (kind === 'place' && isShortPlaceHop(separation)) {
    return { method: 'easeTo', duration: CAMERA_DURATION.placeShort };
  }
  return { method: 'flyTo', duration: cappedFlyDuration(kind, separation) };
}

/** True once per flyRequest.nonce so a layout/zoom rerender cannot start a second camera. */
export function claimFlyNonce(started: { current: number | null }, nonce: number): boolean {
  if (started.current === nonce) return false;
  started.current = nonce;
  return true;
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

export interface CameraHandlerRef {
  current: (() => void) | null;
}

export interface CameraControllerMap {
  flyTo: (options: Record<string, unknown>) => unknown;
  easeTo: (options: Record<string, unknown>) => unknown;
  once: (event: string, handler: () => void) => unknown;
  off: (event: string, handler: () => void) => unknown;
}

/**
 * Cancel the previous moveend handler, start flyTo or easeTo, then attach
 * the new listener. Same interrupt rule as flyToThenOnMoveend: attach after
 * start so mapbox-gl's synchronous stop()/moveend does not consume it.
 */
export function startCameraAnimation(
  map: CameraControllerMap,
  handlerRef: CameraHandlerRef,
  method: CameraMethod,
  options: Record<string, unknown>,
  onEnd: () => void = () => undefined
): void {
  if (handlerRef.current) {
    map.off('moveend', handlerRef.current);
    handlerRef.current = null;
  }
  const onMoveEnd = () => {
    if (handlerRef.current !== onMoveEnd) return;
    handlerRef.current = null;
    onEnd();
  };
  if (method === 'flyTo') {
    map.flyTo(options);
  } else {
    map.easeTo(options);
  }
  map.once('moveend', onMoveEnd);
  handlerRef.current = onMoveEnd;
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
