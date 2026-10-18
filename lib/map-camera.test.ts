import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAWER_OCCUPIED,
  DRAWER_WIDTH,
  LIST_PANEL_RIGHT,
  MAP_CONTROL_MARGIN,
  MAP_CONTROL_SIZE,
  MIN_MAP_STRIP,
  PACIFIC_SEAM_LNG,
  PANEL_PADDING_RIGHT,
  WORLDWIDE_COMFORT_LNG,
  ZERO_PADDING,
  easeOutCubic,
  flyPadding,
  flyToThenOnMoveend,
  MERCATOR_TILE_SIZE,
  LIST_EXPAND_RESIZE_MS,
  WORLD_FIT_EDGE_PAD,
  canvasLayoutAfterPan,
  canvasLayoutIgnoresList,
  cssColorFromPaint,
  defaultCompactList,
  hideListForWorldwidePreset,
  isUserMapMove,
  layoutInsets,
  lngScreenCopies,
  listPanelRightEdge,
  lowZoomCanvasLayout,
  mapControlsRightPx,
  mapboxHeightMinZoom,
  mercatorWorldPx,
  narrowWidthFitZoom,
  needsLowZoomCanvas,
  pinHintCenterX,
  presetCamera,
  readMapWaterColor,
  scheduleMapResize,
  shouldCollapseList,
  shouldReapplyNarrowWorldwide,
  shouldReapplyPresetOnSizeChange,
  worldwideFraming,
  worldwideMapHeightCap,
  zoomToFitRadiusKm,
} from './map-camera';

const PLACES = [
  ['Hawaii', -157.8],
  ['US', -98.6],
  ['Australia', 151.2],
  ['NZ', 174.8],
  ['Fiji', 178.0],
] as const;

const CLUSTER_INSET = 12;

function assertPlacesInGap(
  canvasWidth: number,
  canvasHeight: number,
  insets?: { left?: number; right?: number }
) {
  const framing = worldwideFraming(canvasWidth, canvasHeight, insets);
  assert.equal(framing.panelRight, insets?.left ?? LIST_PANEL_RIGHT);
  assert.equal(framing.lat, 20);
  const gapRight = canvasWidth - framing.rightPadding;
  for (const [name, lng] of PLACES) {
    const copies = lngScreenCopies(
      lng,
      framing.lng,
      framing.zoom,
      canvasWidth,
      framing.panelRight,
      framing.rightPadding
    );
    const inGap = copies.some(
      (x) => x > framing.panelRight + CLUSTER_INSET && x < gapRight - CLUSTER_INSET
    );
    assert.ok(
      inGap,
      `${name} (${lng}) copies [${copies.map((x) => x.toFixed(1)).join(', ')}] must sit in the gap ` +
        `(${framing.panelRight + CLUSTER_INSET}..${gapRight - CLUSTER_INSET}) ` +
        `on ${canvasWidth}x${canvasHeight} zoom=${framing.zoom.toFixed(3)} lng=${framing.lng.toFixed(2)}`
    );
  }
}

test('list panel right edge matches the floating list (16 + 380)', () => {
  assert.equal(LIST_PANEL_RIGHT, 396);
  assert.equal(listPanelRightEdge(1440), 396);
  assert.equal(listPanelRightEdge(1280), 396);
  assert.equal(listPanelRightEdge(768), 396);
});

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function chromeRects(width: number, height: number, panelOpen: boolean) {
  const insets = layoutInsets(width, panelOpen);
  const list = insets.collapseList
    ? null
    : { left: 16, right: 16 + 380, top: 104, bottom: height - 16 };
  const drawer = panelOpen
    ? {
        left: width - 16 - Math.min(DRAWER_WIDTH, width - 32),
        right: width - 16,
        top: 104,
        bottom: height - 112,
      }
    : null;
  const controlRight = mapControlsRightPx(width, panelOpen);
  const controlLeft = width - controlRight - MAP_CONTROL_SIZE;
  const controls = {
    left: controlLeft,
    right: controlLeft + MAP_CONTROL_SIZE,
    top: height - 24 - (MAP_CONTROL_SIZE * 3 + 16),
    bottom: height - 24,
  };
  const hintX = pinHintCenterX(width, panelOpen);
  const hint = { left: hintX - 90, right: hintX + 90, top: 96, bottom: 124 };
  return { insets, list, drawer, controls, hint };
}

for (const width of [768, 1280, 1440] as const) {
  test(`layout at ${width}px keeps list, drawer, and controls from overlapping`, () => {
    const closed = chromeRects(width, 900, false);
    assert.equal(closed.insets.collapseList, false);
    assert.ok(closed.list);
    assert.equal(closed.drawer, null);
    assert.ok(!rectsOverlap(closed.list, closed.controls), 'closed: controls must clear the list');

    const open = chromeRects(width, 900, true);
    if (width === 768) {
      assert.equal(shouldCollapseList(768, true), true);
      assert.equal(open.insets.collapseList, true);
      assert.equal(open.list, null);
      assert.equal(open.insets.left, 0);
    } else {
      assert.equal(shouldCollapseList(width, true), false);
      assert.ok(open.list);
      assert.ok(!rectsOverlap(open.list, open.drawer!), `${width}: list vs drawer`);
      assert.ok(!rectsOverlap(open.list, open.controls), `${width}: controls vs list`);
    }
    assert.ok(open.drawer);
    assert.ok(!rectsOverlap(open.drawer, open.controls), `${width}: controls vs drawer`);
    assert.ok(!rectsOverlap(open.hint, open.drawer), `${width}: pin hint vs drawer`);
    if (open.list) {
      assert.ok(!rectsOverlap(open.hint, open.list), `${width}: pin hint vs list`);
    }
    assert.ok(open.controls.left >= open.insets.listRight);
    assert.ok(open.controls.right <= open.drawer.left);
  });
}

test('flyTo padding tracks collapsed list at 768 and full list at 1280/1440', () => {
  const narrow = flyPadding(true, false, { width: 768, height: 900 });
  assert.equal(narrow.left, 0);
  assert.ok(narrow.right >= DRAWER_OCCUPIED - 32);

  const mid = flyPadding(true, false, { width: 1280, height: 900 });
  assert.equal(mid.left, LIST_PANEL_RIGHT);
  assert.equal(mid.right, PANEL_PADDING_RIGHT);

  const wide = flyPadding(true, false, { width: 1440, height: 900 });
  assert.equal(wide.left, LIST_PANEL_RIGHT);
  assert.equal(wide.right, PANEL_PADDING_RIGHT);

  const worldwide = flyPadding(true, true, { width: 768, height: 900 });
  assert.equal(worldwide.left, 0);
  assert.equal(worldwide.right, 0);
});

test('map controls sit in the visible map strip at every target width', () => {
  assert.equal(mapControlsRightPx(1440, false), MAP_CONTROL_MARGIN);
  for (const width of [768, 1280, 1440]) {
    const right = mapControlsRightPx(width, true);
    const drawerLeft = width - DRAWER_OCCUPIED;
    assert.ok(width - right >= drawerLeft - MIN_MAP_STRIP);
    assert.ok(width - right <= drawerLeft);
  }
});

test('isUserMapMove uses originalEvent or a flight tag', () => {
  assert.equal(isUserMapMove({ originalEvent: { type: 'mouseup' } }), true);
  assert.equal(isUserMapMove({ originalEvent: { type: 'mouseup' } }, 'preset'), true);
  assert.equal(isUserMapMove({}, 'preset'), false);
  assert.equal(isUserMapMove({ originalEvent: undefined }, 'place'), false);
  assert.equal(isUserMapMove({}), false);
  assert.equal(isUserMapMove(null, 'preset'), false);
  assert.equal(isUserMapMove(undefined), false);
});

test('resize and programmatic camera never count as a user move', () => {
  assert.equal(isUserMapMove({ originalEvent: { type: 'resize' } }), false);
  assert.equal(isUserMapMove({ originalEvent: { type: 'resize' } }, 'preset'), false);
  assert.equal(isUserMapMove({ originalEvent: { type: 'orientationchange' } }), false);
  assert.equal(isUserMapMove({}, 'resize'), false);
  assert.equal(isUserMapMove({ originalEvent: { type: 'mouseup' } }, 'resize'), false);
  assert.equal(isUserMapMove({}, 'programmatic'), false);
  assert.equal(isUserMapMove({ originalEvent: { type: 'wheel' } }), true);
});

test('resize does not flip the chip to Map area', () => {
  let leftPreset = false;
  const onUserCameraMove = () => {
    leftPreset = true;
  };
  for (const event of [
    { originalEvent: { type: 'resize' } as { type: string }, tag: null as string | null },
    { originalEvent: undefined as { type: string } | undefined, tag: 'resize' },
    { originalEvent: { type: 'resize' }, tag: 'preset' },
    { originalEvent: undefined, tag: 'programmatic' },
  ]) {
    if (isUserMapMove({ originalEvent: event.originalEvent }, event.tag)) onUserCameraMove();
  }
  assert.equal(leftPreset, false);
  if (isUserMapMove({ originalEvent: { type: 'mouseup' } })) onUserCameraMove();
  assert.equal(leftPreset, true);
});

test('scheduleMapResize coalesces to one map.resize() per frame', () => {
  const calls: string[] = [];
  const map = { resize: () => calls.push('resize') };
  const state = { rafId: null as number | null };
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const raf = (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  const cancel = (id: number) => {
    pending.delete(id);
  };
  scheduleMapResize(map, state, raf, cancel);
  scheduleMapResize(map, state, raf, cancel);
  scheduleMapResize(map, state, raf, cancel);
  assert.equal(pending.size, 1);
  assert.equal(calls.length, 0);
  const cb = [...pending.values()][0];
  cb(0);
  assert.equal(calls.length, 1);
  assert.equal(state.rafId, null);
  scheduleMapResize(null, state, raf, cancel);
  assert.equal(calls.length, 1);
});

test('shouldReapplyPresetOnSizeChange on breakpoint but not after leaving the preset', () => {
  const compact = { width: 768, height: 900 };
  const desktop = { width: 1280, height: 900 };
  assert.equal(shouldReapplyPresetOnSizeChange(false, compact, desktop), true);
  assert.equal(shouldReapplyPresetOnSizeChange(false, desktop, compact), true);
  assert.equal(shouldReapplyPresetOnSizeChange(true, compact, desktop), false);
  assert.equal(shouldReapplyPresetOnSizeChange(false, null, desktop), false);
  assert.equal(shouldReapplyPresetOnSizeChange(false, compact, compact), false);
  assert.equal(shouldReapplyPresetOnSizeChange(false, compact, { width: 768, height: 1024 }), true);
});

test('presetCamera re-frames Worldwide when the breakpoint changes', () => {
  const loc = { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 };
  const at768 = presetCamera(loc, 768, 900, { left: 0, right: 0 });
  const at1280 = presetCamera(loc, 1280, 900);
  assert.ok(at768.zoom <= Math.log2(768 / 512) + 1e-9);
  assert.ok(Math.abs(at768.zoom - narrowWidthFitZoom(768)) < 1e-9);
  assert.equal(at768.lng, WORLDWIDE_COMFORT_LNG);
  assert.ok(at1280.zoom > at768.zoom);
  assert.notEqual(at1280.lng, at768.lng);
  assert.equal(LIST_EXPAND_RESIZE_MS, 220);
});

test('flyPadding exactZoom uses fitTop so the map can fill behind the chrome', () => {
  const padded = flyPadding(false, true, { width: 768, height: 900 }, true, 179);
  assert.equal(padded.top, 179);
  assert.equal(padded.left, 0);
  assert.equal(padded.right, 0);
  const desktop = flyPadding(false, true, { width: 1280, height: 900 }, false, 0);
  assert.equal(desktop.top, 0);
  assert.equal(desktop.left, LIST_PANEL_RIGHT);
});

test('1280x900 uses the height min zoom and a Pacific seam, not a gap-fit zoom', () => {
  const framing = worldwideFraming(1280, 900);
  const heightMin = mapboxHeightMinZoom(900);
  assert.ok(Math.abs(framing.zoom - heightMin) < 1e-9);
  assert.ok(framing.worldPx > framing.gap);
  assert.equal(framing.overflow, true);
  assert.notEqual(framing.lng, WORLDWIDE_COMFORT_LNG);
  const seamCopies = lngScreenCopies(
    PACIFIC_SEAM_LNG,
    framing.lng,
    framing.zoom,
    1280,
    framing.panelRight
  );
  const seamAtPanel = seamCopies.some((x) => Math.abs(x - framing.panelRight) < 1);
  assert.ok(seamAtPanel, `Pacific seam -170 should sit on the panel edge, copies=${seamCopies}`);
  assertPlacesInGap(1280, 900);
});

test('1440x900 keeps the comfortable lng -20 framing and fits the world in the gap', () => {
  const framing = worldwideFraming(1440, 900);
  assert.equal(framing.overflow, false);
  assert.equal(framing.lng, WORLDWIDE_COMFORT_LNG);
  assert.ok(framing.worldPx <= framing.gap + 1);
  assertPlacesInGap(1440, 900);
});

test('Worldwide framing at 768 with a collapsed list fits the whole world', () => {
  const framing = worldwideFraming(768, 900, { left: 0, right: 0 });
  assert.equal(framing.panelRight, 0);
  assert.equal(framing.rightPadding, 0);
  assert.equal(framing.gap, 768);
  assert.equal(framing.overflow, false);
  assert.equal(framing.lng, WORLDWIDE_COMFORT_LNG);
  assert.equal(framing.lat, 20);
  assert.ok(framing.zoom < mapboxHeightMinZoom(900));
  assert.ok(framing.worldPx <= framing.gap + 1);
  assertPlacesInGap(768, 900, { left: 0, right: 0 });
});

test('hideListForWorldwidePreset is only narrow Worldwide while still on the chip', () => {
  assert.equal(hideListForWorldwidePreset(768, true, false), true);
  assert.equal(hideListForWorldwidePreset(768, true, true), false);
  assert.equal(hideListForWorldwidePreset(1280, true, false), false);
  assert.equal(hideListForWorldwidePreset(1440, true, false), false);
  assert.equal(hideListForWorldwidePreset(768, false, false), false);
});

test('defaultCompactList is every preset at ≤768', () => {
  assert.equal(defaultCompactList(768), true);
  assert.equal(defaultCompactList(1280), false);
  assert.equal(defaultCompactList(1440), false);
});

test('at 768x900 Worldwide camera zoom is <= log2(768/512) and populated longitudes fit', () => {
  const viewport = { width: 768, height: 900 };
  const widthFitZoom = Math.log2(768 / MERCATOR_TILE_SIZE);
  const loc = { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 };
  const camera = presetCamera(loc, 768, 900, { left: 0, right: 0 });
  assert.ok(camera.zoom <= widthFitZoom + 1e-9);
  assert.ok(camera.zoom <= narrowWidthFitZoom(768) + 1e-9);

  const layout = lowZoomCanvasLayout(viewport, camera.zoom);
  assert.ok(layout.height <= 768);
  assert.ok(mapboxHeightMinZoom(layout.height) <= camera.zoom + 1e-9);
  assertPlacesInGap(768, layout.height, { left: 0, right: 0 });

  const framing = worldwideFraming(768, 900, { left: 0, right: 0 });
  assert.equal(framing.overflow, false);
  assert.ok(framing.worldPx <= 768 - 2 * WORLD_FIT_EDGE_PAD + 1);
  const populated = [
    ['Hawaii', -157.8],
    ['Japan', 139.69],
    ['Sydney', 151.21],
    ['Melbourne', 144.96],
    ['Fiji', 178.0],
    ['NZ', 174.78],
  ] as const;
  for (const [name, lng] of populated) {
    const copies = lngScreenCopies(lng, camera.lng, camera.zoom, 768, 0, 0);
    const onScreen = copies.some((x) => x > WORLD_FIT_EDGE_PAD && x < 768 - WORLD_FIT_EDGE_PAD);
    assert.ok(
      onScreen,
      `${name} (${lng}) copies [${copies.map((x) => x.toFixed(1)).join(', ')}] ` +
        `must sit in ${WORLD_FIT_EDGE_PAD}..${768 - WORLD_FIT_EDGE_PAD} at zoom=${camera.zoom.toFixed(3)}`
    );
  }

  const desktop = lowZoomCanvasLayout({ width: 1280, height: 900 }, 0.814);
  assert.deepEqual(desktop, { top: 0, height: 900 });
  const framing1280 = worldwideFraming(1280, 900);
  assert.ok(Math.abs(framing1280.zoom - mapboxHeightMinZoom(900)) < 1e-9);
  const framing1440 = worldwideFraming(1440, 900);
  assert.ok(Math.abs(framing1440.zoom - Math.log2((1440 - LIST_PANEL_RIGHT) / 512)) < 1e-9);
});

test('1280→768 re-applies narrow Worldwide framing while the chip is still Worldwide', () => {
  const desktop = { width: 1280, height: 900 };
  const compact = { width: 768, height: 900 };
  assert.equal(needsLowZoomCanvas(1280, 900), false);
  assert.equal(needsLowZoomCanvas(768, 900), true);
  assert.equal(shouldReapplyNarrowWorldwide(false, 'worldwide', desktop, compact), true);
  assert.equal(shouldReapplyNarrowWorldwide(false, 'worldwide', compact, desktop), false);
  assert.equal(shouldReapplyNarrowWorldwide(true, 'worldwide', desktop, compact), false);
  assert.equal(shouldReapplyNarrowWorldwide(false, 'tokyo', desktop, compact), false);
  assert.equal(shouldReapplyNarrowWorldwide(false, 'worldwide', null, compact), false);
  assert.equal(shouldReapplyPresetOnSizeChange(false, desktop, compact), true);

  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    compact.width,
    compact.height,
    { left: 0, right: 0 }
  );
  assert.ok(camera.zoom <= narrowWidthFitZoom(768) + 1e-9);
  assert.ok(camera.zoom < mapboxHeightMinZoom(900));
});

test('shortened canvas follows zoom, not the Worldwide chip, and a pan keeps zoom', () => {
  const viewport = { width: 768, height: 900 };
  const lowZoom = narrowWidthFitZoom(768);
  const atChip = lowZoomCanvasLayout(viewport, lowZoom);
  const afterLeaveChip = lowZoomCanvasLayout(viewport, lowZoom);
  assert.deepEqual(atChip, afterLeaveChip);
  assert.ok(atChip.height < 900);
  assert.ok(mapboxHeightMinZoom(atChip.height) <= lowZoom + 1e-9);

  const panned = canvasLayoutAfterPan(viewport, lowZoom);
  assert.equal(panned.zoom, lowZoom);
  assert.deepEqual(panned.layout, atChip);

  const midZoom = 0.7;
  const mid = lowZoomCanvasLayout(viewport, midZoom);
  assert.ok(Math.abs(mid.height - mercatorWorldPx(midZoom)) < 1e-6);
  assert.equal(mid.top + mid.height, 900);
  assert.ok(mid.height > atChip.height);
  assert.ok(mid.height < 900);

  const pastClamp = lowZoomCanvasLayout(viewport, mapboxHeightMinZoom(900));
  assert.deepEqual(pastClamp, { top: 0, height: 900 });
});

test('Show list does not remesasure or shrink the 768 Worldwide canvas', () => {
  const viewport = { width: 768, height: 900 };
  const zoom = narrowWidthFitZoom(768);
  const hidden = canvasLayoutIgnoresList(viewport, zoom);
  const shown = lowZoomCanvasLayout(viewport, zoom);
  assert.deepEqual(hidden, shown);
  assert.equal(shown.top + shown.height, 900);
  assert.ok(shown.height < 900);
  assert.ok(shown.height !== 768 || shown.top !== 0);
});

test('readMapWaterColor prefers the water layer over beige', () => {
  assert.equal(cssColorFromPaint('#cad2d3'), '#cad2d3');
  assert.equal(
    cssColorFromPaint(['interpolate', ['linear'], ['zoom'], 0, '#a8d5e5', 8, '#7eb6c9']),
    '#7eb6c9'
  );
  const paint: Record<string, Record<string, unknown>> = {
    water: { 'fill-color': '#cad2d3' },
    background: { 'background-color': '#f8f4f0' },
  };
  assert.equal(
    readMapWaterColor((layer, prop) => paint[layer]?.[prop]),
    '#cad2d3'
  );
  delete paint.water;
  assert.equal(
    readMapWaterColor((layer, prop) => paint[layer]?.[prop]),
    '#f8f4f0'
  );
  assert.notEqual(readMapWaterColor((layer, prop) => paint[layer]?.[prop]), '#e8e4dc');
});

test('768x1024 Worldwide zoom fits 360° of longitude in the canvas width', () => {
  const framing = worldwideFraming(768, 1024, { left: 0, right: 0 });
  const widthFitZoom = Math.log2(768 / MERCATOR_TILE_SIZE);
  assert.ok(framing.zoom <= widthFitZoom + 1e-9);
  assert.ok(framing.worldPx <= 768 + 1);
  assert.equal(framing.overflow, false);
  assertPlacesInGap(768, 1024, { left: 0, right: 0 });
  const cap = worldwideMapHeightCap(768, 1024 - 160);
  assert.ok(cap <= 768);
  assert.ok(mapboxHeightMinZoom(cap) <= widthFitZoom + 1e-9);
});

test('flyPadding with forced collapse at 768 Worldwide uses the full width', () => {
  const padding = flyPadding(false, true, { width: 768, height: 900 }, true);
  assert.equal(padding.left, 0);
  assert.equal(padding.right, 0);
});

test('presetCamera keeps desktop zoom and tightens ≤768 so the radius fits', () => {
  const tokyo = { id: 'tokyo', lat: 35.6762, lng: 139.6503, zoom: 11, radiusKm: 30 };
  const desktop = presetCamera(tokyo, 1440, 900);
  assert.equal(desktop.zoom, 11);
  assert.equal(desktop.lng, tokyo.lng);
  const narrow = presetCamera(tokyo, 768, 900, { left: 0, right: 0 });
  assert.ok(narrow.zoom < 11);
  const fit = zoomToFitRadiusKm(tokyo.lat, tokyo.radiusKm, 768 * 0.86);
  assert.ok(narrow.zoom <= fit + 1e-9);
});

test('768 with the list still uses the height-min floor (collapse is what lowers zoom)', () => {
  const withList = worldwideFraming(768, 900);
  assert.equal(withList.panelRight, LIST_PANEL_RIGHT);
  assert.ok(Math.abs(withList.zoom - mapboxHeightMinZoom(900)) < 1e-9);
  assert.equal(withList.overflow, true);
});

test('Worldwide framing subtracts drawer right padding from the visible gap', () => {
  const open = worldwideFraming(1440, 900, { right: 496 });
  const closed = worldwideFraming(1440, 900);
  assert.equal(open.rightPadding, 496);
  assert.equal(open.gap, 1440 - LIST_PANEL_RIGHT - 496);
  assert.ok(open.gap < closed.gap);
});

/**
 * Stand-in for mapbox-gl 3.33: flyTo() calls stop() first, which fires moveend
 * synchronously and invokes every registered once-listener (not just the first).
 */
class InterruptibleMap {
  padding = { ...ZERO_PADDING };
  private flying = false;
  private pending: Array<() => void> = [];

  getPadding() {
    return { ...this.padding };
  }

  once(_event: string, handler: () => void) {
    this.pending.push(handler);
  }

  off(_event: string, handler: () => void) {
    this.pending = this.pending.filter((item) => item !== handler);
  }

  private emitMoveend() {
    const handlers = this.pending.splice(0);
    for (const handler of handlers) handler();
  }

  flyTo(options: { padding?: Partial<typeof ZERO_PADDING> }) {
    if (this.flying) {
      this.flying = false;
      this.emitMoveend();
    }
    this.flying = true;
    if (options.padding) {
      this.padding = { ...ZERO_PADDING, ...options.padding };
    }
  }

  endFlight() {
    this.flying = false;
    this.emitMoveend();
  }
}

/** Mirrors PlacesMap: off the previous handler, then flyToThenOnMoveend, then store the new one. */
function startPlacesMapFlight(
  map: InterruptibleMap,
  handlerRef: { current: (() => void) | null }
) {
  if (handlerRef.current) {
    map.off('moveend', handlerRef.current);
    handlerRef.current = null;
  }
  const onFlyEnd = () => {
    handlerRef.current = null;
    map.padding = { ...ZERO_PADDING };
  };
  flyToThenOnMoveend(map, { padding: { ...ZERO_PADDING, left: 396 } }, onFlyEnd);
  handlerRef.current = onFlyEnd;
}

test('easeOutCubic is 0 at start, 1 at end, and faster early', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('preset change mid-flight leaves padding at 0', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  startPlacesMapFlight(map, handlerRef);
  assert.equal(map.getPadding().left, 396);
  startPlacesMapFlight(map, handlerRef);
  assert.equal(map.getPadding().left, 396);
  map.endFlight();
  assert.deepEqual(map.getPadding(), ZERO_PADDING);
});
