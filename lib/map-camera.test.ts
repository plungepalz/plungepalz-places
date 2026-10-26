import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createListHeadingMachine,
  listHeadingText,
  settleListHeadingRequest,
  shouldApplySettledSearch,
  shouldCommitSearchUi,
  startListHeadingRequest,
} from './list-heading-state';
import { LOCATION_PRESETS } from './locations';
import { searchAfterViewportChange } from './search-debounce';
import {
  DRAWER_OCCUPIED,
  DRAWER_WIDTH,
  DESKTOP_LIST_OVERLAP,
  LIST_PANEL_RIGHT,
  MAP_CONTROL_MARGIN,
  MAP_CONTROL_SIZE,
  MIN_MAP_STRIP,
  PACIFIC_SEAM_LNG,
  PANEL_PADDING_RIGHT,
  WORLDWIDE_COMFORT_LNG,
  ZERO_PADDING,
  CAMERA_DURATION,
  CAMERA_DURATION_CAP,
  CAMERA_FLY,
  clusterExpandCamera,
  cameraEaseOptions,
  cameraFlyOptions,
  cameraReachedTarget,
  cameraSeparation,
  cappedFlyDuration,
  classifyFlightEnd,
  clusterPointerMoved,
  isGenuineClusterClick,
  easeOutCubic,
  flyPadding,
  flyToThenOnMoveend,
  cameraMoveendEffects,
  isProgrammaticCanvasMove,
  isProgrammaticFlightTag,
  isUserGestureEvent,
  isShortCameraHop,
  isShortPlaceHop,
  paddingIsZero,
  pickCameraAnimation,
  shouldGrowCanvasForZoom,
  shouldQueueClusterExpand,
  shouldReportViewport,
  shouldSearchOnUserMoveend,
  abandonCameraAnimation,
  startCameraAnimation,
  type CameraEndReason,
  type FlightEndKind,
  MERCATOR_TILE_SIZE,
  LIST_EXPAND_MS,
  LIST_EXPAND_RESIZE_MS,
  WORLD_FIT_EDGE_PAD,
  canvasBoxEquals,
  canvasFillStyle,
  canvasHostStyle,
  canvasLayoutAfterPan,
  canvasLayoutIgnoresList,
  canvasReadyForFlight,
  clearPaddingKeepView,
  createCanvasMachine,
  cssColorFromPaint,
  evaluatePaintColor,
  formatCssRgb,
  parseCssColor,
  claimFlyNonce,
  defaultCompactList,
  STREETS_LOW_ZOOM_OCEAN,
  STREETS_LOW_ZOOM_OCEAN_MAX,
  resolveWaterFillCss,
  hideListForWorldwidePreset,
  isUserMapMove,
  layoutInsets,
  lngScreenCopies,
  listPanelRightEdge,
  lowZoomCanvasLayout,
  mapControlsRightPx,
  mapboxChromeInsetLeft,
  mapboxChromeLayout,
  mapboxChromeRects,
  MAPBOX_ATTRIB,
  MAPBOX_LOGO,
  mapboxHeightMinZoom,
  mapNeedsResize,
  mercatorWorldPx,
  narrowWidthFitZoom,
  needsLowZoomCanvas,
  pinHintCenterX,
  presetCamera,
  presetFlyCamera,
  readMeasuredViewport,
  unpaddedCenter,
  readMapWaterColor,
  reduceCanvasMachine,
  scheduleMapResize,
  shouldCollapseList,
  shouldApplyNarrowWorldwideAfterResize,
  shouldClearPaddingAfterFlight,
  shouldJumpToNarrowWorldwideFit,
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

test('Mapbox chrome sits to the right of the open list panel', () => {
  assert.equal(DESKTOP_LIST_OVERLAP, 1280);
  assert.equal(mapboxChromeInsetLeft(1440, false), LIST_PANEL_RIGHT);
  assert.equal(mapboxChromeInsetLeft(1280, false), LIST_PANEL_RIGHT);
  assert.equal(mapboxChromeInsetLeft(1440, true), 0);
  assert.equal(mapboxChromeInsetLeft(768, true), 0);
  assert.deepEqual(mapboxChromeLayout({ canvasWidth: 1440, collapseList: false }), {
    left: LIST_PANEL_RIGHT,
    bottom: 0,
  });
  assert.ok(mapboxChromeInsetLeft(1440, false) >= 380);
});

test('Mapbox logo and attribution stay visible above the 768 list sheet', () => {
  const height = 900;
  const header = { left: 0, right: 768, top: 0, bottom: 112 };
  const sheet = { left: 16, right: 16 + 380, top: 112, bottom: height - 16 };
  const shown = mapboxChromeRects(768, height, false);
  assert.ok(shown.logo.left >= sheet.right, '768 shown: logo sits in the visible map gap');
  assert.ok(!rectsOverlap(shown.logo, sheet), '768 shown: logo vs sheet');
  assert.ok(!rectsOverlap(shown.attrib, sheet), '768 shown: attrib vs sheet');
  assert.ok(!rectsOverlap(shown.logo, shown.attrib), '768 shown: logo vs attribution');
  assert.ok(!rectsOverlap(shown.logo, header), '768 shown: logo vs header');
  assert.ok(!rectsOverlap(shown.attrib, header), '768 shown: attrib vs header');
  assert.ok(mapboxChromeLayout({ canvasWidth: 768, collapseList: false }).bottom > 0);

  const hidden = mapboxChromeRects(768, height, true);
  assert.equal(hidden.logo.left, MAPBOX_LOGO.pad);
  assert.ok(!rectsOverlap(hidden.logo, header), '768 hidden: logo vs header');
  assert.ok(!rectsOverlap(hidden.logo, hidden.attrib), '768 hidden: logo vs attribution');

  for (const width of [1280, 1440] as const) {
    const desktop = mapboxChromeRects(width, height, false);
    const desktopSheet = { left: 16, right: 16 + 380, top: 104, bottom: height - 16 };
    assert.equal(desktop.logo.left, LIST_PANEL_RIGHT + MAPBOX_LOGO.pad);
    assert.ok(!rectsOverlap(desktop.logo, desktopSheet), `${width}: logo vs list`);
    assert.ok(!rectsOverlap(desktop.logo, desktop.attrib), `${width}: logo vs attrib`);
    assert.equal(mapboxChromeLayout({ canvasWidth: width, collapseList: false }).bottom, 0);
  }
  assert.ok(MAPBOX_ATTRIB.width > 0);
});

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

test('pin-plus-drawer padding keeps the selected pin off the drawer edge', () => {
  for (const width of [1280, 1440]) {
    const padding = flyPadding(true, false, { width, height: 900 });
    const drawerLeft = width - DRAWER_OCCUPIED;
    const paddedRight = width - padding.right;
    assert.ok(
      drawerLeft - paddedRight >= 24,
      `${width}: padded map should sit ≥24px left of the drawer (gap=${drawerLeft - paddedRight})`
    );
    assert.ok(padding.right >= DRAWER_OCCUPIED);
  }
});

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
  assert.equal(isUserMapMove({}, 'programmatic'), false);
  assert.equal(isUserMapMove({ originalEvent: { type: 'wheel' } }), true);
});

test('slow inertial wheel leaves the preset and reports bounds without originalEvent', () => {
  const inertial = cameraMoveendEffects({}, null, { userInputActive: true, zoomChanged: true });
  assert.equal(inertial.leavePreset, true);
  assert.equal(inertial.reportBounds, true);
  assert.equal(isUserMapMove({}, null, { zoomChanged: true }), false);
  assert.equal(isUserMapMove({}, 'resize', { zoomChanged: true }), false);
  assert.equal(isUserMapMove({}, 'resize', { userInputActive: true }), true);

  const leftoverResize = cameraMoveendEffects({}, 'resize');
  assert.equal(leftoverResize.leavePreset, false);

  let lastKey = 'preset:united-states';
  const ticks = ['bbox-a', 'bbox-b', 'bbox-c'];
  const searches: string[] = [];
  for (const boundsKey of ticks) {
    const decision = searchAfterViewportChange({
      leftPreset: true,
      boundsKey,
      lastPresetKey: lastKey,
      cameraBusy: false,
    });
    if (decision.action === 'skip') continue;
    lastKey = boundsKey;
    searches.push(boundsKey);
  }
  assert.deepEqual(searches, ticks, 'none of the small moveends may be swallowed');
});

test('user wheel zoom-in leaves Worldwide and bounds-searches even with a leftover resize tag', () => {
  const wheel = { originalEvent: { type: 'wheel' } };
  const effects = cameraMoveendEffects(wheel, 'resize');
  assert.equal(isUserMapMove(wheel, 'resize'), true);
  assert.equal(isUserMapMove(wheel, 'programmatic'), true);
  assert.equal(effects.leavePreset, true);
  assert.equal(effects.reportBounds, true);

  // The regrow's own resize-tagged jumpTo / map.resize() has no gesture.
  const leaked = cameraMoveendEffects({}, 'resize');
  assert.equal(leaked.leavePreset, false);
  assert.equal(leaked.reportBounds, true);

  let leftPreset = false;
  if (effects.leavePreset) leftPreset = true;
  assert.equal(leftPreset, true);
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset,
      boundsKey: 'zoomed-16-places',
      lastPresetKey: '',
      cameraBusy: false,
    }),
    { action: 'moveend', nextPresetKey: 'zoomed-16-places' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: '',
    }),
    { action: 'filters', nextPresetKey: 'preset-chip' }
  );
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

test('mapNeedsResize is false when the canvas already matches the host', () => {
  const canvas = { clientWidth: 768, clientHeight: 704 };
  const host = { clientWidth: 768, clientHeight: 704 };
  assert.equal(mapNeedsResize(canvas, host), false);
  assert.equal(mapNeedsResize({ clientWidth: 768, clientHeight: 900 }, host), true);
  assert.equal(mapNeedsResize(null, host), true);
  assert.equal(mapNeedsResize({ clientWidth: 0, clientHeight: 0 }, host), true);
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
  scheduleMapResize(map, state, raf, cancel, () => calls.push('after-stale'));
  scheduleMapResize(map, state, raf, cancel, () => calls.push('after'));
  scheduleMapResize(map, state, raf, cancel, () => calls.push('after'));
  assert.equal(pending.size, 1);
  assert.equal(calls.length, 0);
  const cb = [...pending.values()][0];
  cb(0);
  assert.deepEqual(calls, ['resize', 'after']);
  assert.equal(state.rafId, null);
  scheduleMapResize(null, state, raf, cancel, () => calls.push('after-null'));
  assert.deepEqual(calls, ['resize', 'after']);
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
  assert.equal(LIST_EXPAND_MS, 280);
  assert.ok(LIST_EXPAND_RESIZE_MS > LIST_EXPAND_MS);
});

test('Show/Hide map.resize() waits until after the max-height transition', () => {
  assert.equal(LIST_EXPAND_MS, 280);
  assert.ok(LIST_EXPAND_RESIZE_MS >= LIST_EXPAND_MS);
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

test('canvas machine keeps a 3.4→0.585 flight short the whole way', () => {
  const viewport = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  let state = createCanvasMachine(viewport);
  state = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: target });
  assert.equal(state.shortened, true);
  assert.equal(state.flightLocked, true);
  const short = state.box.height;
  assert.ok(short < 900);
  assert.ok(mapboxHeightMinZoom(short) <= target + 1e-9);
  for (const zoom of [3.4, 2.4, 1.6, 1.1, 0.9, 0.7, target]) {
    state = reduceCanvasMachine(state, { type: 'flightProgress', zoom });
    assert.equal(state.box.height, short, `canvas grew at live zoom ${zoom}`);
  }
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  assert.equal(state.flightLocked, false);
  assert.equal(state.box.height, short);
  assert.ok(state.shortened);
});

test('canvas machine: a drag keeps the short canvas', () => {
  const viewport = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: target,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  const short = state.box.height;
  state = reduceCanvasMachine(state, { type: 'pan', zoom: target });
  state = reduceCanvasMachine(state, { type: 'pan', zoom: target });
  assert.equal(state.box.height, short);
  assert.equal(state.shortened, true);
});

test('canvas machine: wheel zoom past the clamp grows the canvas once', () => {
  const viewport = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  const clamp = mapboxHeightMinZoom(900);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: target,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  const short = state.box.height;
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: 0.7, prevZoom: target });
  assert.ok(state.box.height < 900);
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: clamp, prevZoom: 0.7 });
  assert.equal(state.box.height, 900);
  assert.equal(state.shortened, false);
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: 2, prevZoom: clamp });
  assert.equal(state.box.height, 900);
  assert.ok(short < 900);
});

test('programmatic non-Worldwide prepareFlight grows the short canvas immediately', () => {
  const viewport = { width: 768, height: 900 };
  const world = narrowWidthFitZoom(768);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: world,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: world });
  assert.equal(state.shortened, true);
  assert.equal(state.box.top, 196);
  assert.equal(shouldGrowCanvasForZoom(11), true);
  assert.equal(shouldGrowCanvasForZoom(world), false);

  const locate = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: 11 });
  assert.equal(locate.shortened, false);
  assert.equal(locate.flightLocked, true);
  assert.deepEqual(locate.box, { top: 0, height: 900 });
  assert.ok(canvasReadyForFlight(locate.box, locate.box));

  const card = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: 12 });
  assert.deepEqual(card.box, { top: 0, height: 900 });

  const cluster = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: 8 });
  assert.deepEqual(cluster.box, { top: 0, height: 900 });

  const zoomPastFloor = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: world + 1 });
  assert.deepEqual(zoomPastFloor.box, { top: 0, height: 900 });
});

test('flightEnd at zoom > 1 never leaves an empty band', () => {
  const viewport = { width: 768, height: 900 };
  const world = narrowWidthFitZoom(768);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: world,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: world });
  assert.ok(state.box.top > 0);
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: 11 });
  assert.equal(state.shortened, false);
  assert.deepEqual(state.box, { top: 0, height: 900 });
});

test('user pan at the narrow-world zoom keeps the short canvas', () => {
  const viewport = { width: 768, height: 900 };
  const world = narrowWidthFitZoom(768);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: world,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: world });
  const short = state.box;
  state = reduceCanvasMachine(state, { type: 'pan', zoom: world });
  assert.deepEqual(state.box, short);
  assert.equal(state.shortened, true);
});

test('768 Worldwide shrink-first lands at 0.459 / 704px / top 196', () => {
  const viewport = { width: 768, height: 900 };
  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    768,
    900,
    { left: 0, right: 0 }
  );
  const target = narrowWidthFitZoom(768);
  assert.ok(Math.abs(camera.zoom - target) < 1e-9);
  assert.ok(Math.abs(camera.zoom - 0.459) < 0.002);
  const state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: camera.zoom,
    viewport,
  });
  assert.equal(state.box.height, 704);
  assert.equal(state.box.top, 196);
  assert.ok(mapboxHeightMinZoom(state.box.height) <= camera.zoom + 1e-9);
  assert.ok(canvasReadyForFlight(state.box, state.box));
  assert.equal(canvasReadyForFlight({ top: 0, height: 900 }, state.box), false);
  const host = canvasHostStyle(state.box);
  assert.equal(host.height, 704);
  assert.equal(host.transform, 'translate3d(0, 196px, 0)');
  const fill = canvasFillStyle(state.box, STREETS_LOW_ZOOM_OCEAN);
  assert.deepEqual(fill, { height: 196, backgroundColor: STREETS_LOW_ZOOM_OCEAN });
  assert.equal(canvasFillStyle({ top: 0, height: 900 }, STREETS_LOW_ZOOM_OCEAN), null);
  const grown = canvasHostStyle({ top: 0, height: 900 });
  assert.equal(grown.transform, 'none');
  assert.equal(grown.height, 900);
  assert.equal(canvasBoxEquals(state.box, { top: 196, height: 704 }), true);
});

test('canvas machine: wheel zoom-out never grows the short canvas', () => {
  const viewport = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  const clamp = mapboxHeightMinZoom(900);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: target,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: 0.7, prevZoom: target });
  assert.ok(state.box.height < 900);
  assert.ok(Math.abs(state.box.height - mercatorWorldPx(0.7)) < 1e-6);
  assert.equal(state.box.top + state.box.height, 900);
  const mid = { ...state.box };
  assert.ok(mid.top > 0);
  // Zoom-out from the grown-but-still-short box must keep that height.
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: 0.55, prevZoom: 0.7 });
  assert.deepEqual(state.box, mid);
  assert.equal(state.shortened, true);
  // A frame that reports the full-height clamp on the way out must not snap
  // top 177→0 / height 723→900. Stay short until a zoom-in reaches the clamp.
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: clamp, prevZoom: 0.9 });
  assert.deepEqual(state.box, mid);
  assert.equal(state.shortened, true);
  state = reduceCanvasMachine(state, { type: 'userZoom', zoom: clamp, prevZoom: 0.7 });
  assert.equal(state.box.height, 900);
  assert.equal(state.shortened, false);
});

test('768→1280→768 re-applies the narrow Worldwide camera after resize settles', () => {
  const compact = { width: 768, height: 900 };
  const desktop = { width: 1280, height: 900 };
  const target = narrowWidthFitZoom(768);
  const clamp = mapboxHeightMinZoom(900);

  let state = createCanvasMachine(compact);
  state = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: target });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  assert.ok(state.shortened);
  assert.ok(state.box.height < 900);

  state = reduceCanvasMachine(state, { type: 'viewport', viewport: desktop });
  assert.equal(state.box.height, 900);
  assert.equal(shouldReapplyNarrowWorldwide(false, 'worldwide', compact, desktop), false);
  assert.equal(shouldJumpToNarrowWorldwideFit(false, 'worldwide', desktop, clamp), false);

  // Second shrink — not only the first 1280→768 — must re-apply the camera
  // after shrink + map.resize(), because live zoom is still the desktop clamp.
  assert.equal(shouldReapplyNarrowWorldwide(false, 'worldwide', desktop, compact), true);
  assert.equal(shouldJumpToNarrowWorldwideFit(false, 'worldwide', compact, clamp), true);
  assert.equal(shouldJumpToNarrowWorldwideFit(false, 'worldwide', compact, target), false);
  assert.equal(shouldJumpToNarrowWorldwideFit(true, 'worldwide', compact, clamp), false);
  assert.equal(shouldJumpToNarrowWorldwideFit(false, 'tokyo', compact, clamp), false);
  assert.equal(
    shouldApplyNarrowWorldwideAfterResize({
      pending: true,
      leftPreset: false,
      locationId: 'worldwide',
      viewport: compact,
      canvasHeight: 900,
      liveZoom: clamp,
    }),
    false,
    'must wait until the short canvas is on screen'
  );
  assert.equal(
    shouldApplyNarrowWorldwideAfterResize({
      pending: true,
      leftPreset: false,
      locationId: 'worldwide',
      viewport: compact,
      canvasHeight: mercatorWorldPx(target),
      liveZoom: clamp,
    }),
    true
  );
  assert.equal(
    shouldApplyNarrowWorldwideAfterResize({
      pending: false,
      leftPreset: false,
      locationId: 'worldwide',
      viewport: compact,
      canvasHeight: mercatorWorldPx(target),
      liveZoom: clamp,
    }),
    false
  );

  state = reduceCanvasMachine(state, {
    type: 'resizeNarrowFit',
    viewport: compact,
    targetZoom: target,
  });
  assert.ok(state.box.height < 900);
  assert.ok(mapboxHeightMinZoom(state.box.height) <= target + 1e-9);

  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    compact.width,
    compact.height,
    { left: 0, right: 0 }
  );
  assert.ok(Math.abs(camera.zoom - target) < 1e-9);
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: camera.zoom });
  assert.ok(state.shortened);
  assert.ok(Math.abs((state.anchorZoom ?? 0) - target) < 1e-9);
});

test('resize 768→1280→768→1440 yields each width\'s own camera', () => {
  const loc = { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 };
  const sequence = [
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ];
  const cameras = sequence.map((measured) => {
    const afterResize = readMeasuredViewport(
      { clientWidth: measured.width, clientHeight: measured.height },
      sequence[0]
    );
    assert.ok(afterResize);
    assert.equal(afterResize.width, measured.width);
    return presetFlyCamera(loc, afterResize);
  });
  assert.equal(cameras[0].lng, WORLDWIDE_COMFORT_LNG);
  assert.ok(Math.abs(cameras[0].zoom - narrowWidthFitZoom(768)) < 1e-9);
  assert.ok(Math.abs(cameras[1].lng - -72.4) < 0.2, `1280 lng ${cameras[1].lng}`);
  assert.deepEqual(
    { lng: cameras[2].lng, lat: cameras[2].lat, zoom: cameras[2].zoom },
    { lng: cameras[0].lng, lat: cameras[0].lat, zoom: cameras[0].zoom }
  );
  assert.ok(Math.abs(cameras[3].zoom - 1.028) < 0.01, `1440 zoom ${cameras[3].zoom}`);
  assert.notEqual(cameras[3].lng, cameras[0].lng);
  assert.notEqual(cameras[3].lng, cameras[1].lng);
  const stale768At1280 = presetFlyCamera(loc, sequence[0]);
  assert.notEqual(cameras[1].lng, stale768At1280.lng);
  const padding1280 = flyPadding(false, true, sequence[1], false, 0);
  const framed1280 = presetCamera(loc, 1280, 900, { left: padding1280.left, right: padding1280.right });
  const visual1280 = unpaddedCenter(framed1280, framed1280.zoom, padding1280);
  assert.ok(Math.abs(visual1280.lng - -72.4) < 0.2);
  assert.ok(Math.abs(framed1280.lng - 6.8) < 0.2);
});

test('canvas machine: resize 1280→768 shrinks then lands at the narrow fit', () => {
  const desktop = { width: 1280, height: 900 };
  const compact = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  let state = createCanvasMachine(desktop);
  assert.equal(state.box.height, 900);
  state = reduceCanvasMachine(state, { type: 'resizeNarrowFit', viewport: compact, targetZoom: target });
  assert.equal(state.viewport.width, 768);
  assert.ok(state.box.height < 900);
  assert.ok(mapboxHeightMinZoom(state.box.height) <= target + 1e-9);
  state = reduceCanvasMachine(state, { type: 'flightProgress', zoom: 0.814 });
  assert.ok(state.box.height < 900);
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  assert.ok(state.shortened);
  assert.ok(Math.abs((state.anchorZoom ?? 0) - target) < 1e-9);
  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    768,
    900,
    { left: 0, right: 0 }
  );
  assert.ok(Math.abs(camera.zoom - target) < 1e-9);
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

test('evaluatePaintColor uses the water interpolate at the current zoom', () => {
  const worldwideZoom = Math.log2(768 / MERCATOR_TILE_SIZE);
  const streetsWater = [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    'rgb(97, 202, 255)',
    8,
    'rgb(153, 221, 255)',
  ];
  assert.equal(cssColorFromPaint(streetsWater), 'rgb(153, 221, 255)');
  assert.equal(evaluatePaintColor(streetsWater, 8), 'rgb(153, 221, 255)');
  assert.equal(evaluatePaintColor(streetsWater, 0), 'rgb(97, 202, 255)');

  const atWorldwide = evaluatePaintColor(streetsWater, worldwideZoom);
  const parsed = atWorldwide ? parseCssColor(atWorldwide) : null;
  assert.ok(parsed);
  const lastStop = parseCssColor('rgb(153, 221, 255)');
  assert.ok(lastStop);
  assert.ok(parsed[0] < 120, `worldwide red ${parsed[0]} should stay near the ocean stop`);
  assert.ok(parsed[1] <= 207, `worldwide green ${parsed[1]} should stay near the ocean stop`);
  assert.equal(parsed[2], 255);
  assert.ok(
    lastStop[0] - parsed[0] >= 30,
    'last-stop fill would leave a light-blue seam against Streets ocean'
  );

  const hslStops = [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    'hsl(200, 100%, 69%)',
    8,
    'hsl(200, 100%, 80%)',
  ];
  const hslWorldwide = parseCssColor(evaluatePaintColor(hslStops, worldwideZoom) ?? '');
  assert.ok(hslWorldwide);
  assert.ok(hslWorldwide[0] >= 97 && hslWorldwide[0] <= 114);
  assert.ok(hslWorldwide[1] >= 202 && hslWorldwide[1] <= 207);
  assert.equal(hslWorldwide[2], 255);

  const paint: Record<string, Record<string, unknown>> = {
    water: { 'fill-color': streetsWater },
  };
  const zoomed = readMapWaterColor((layer, prop) => paint[layer]?.[prop], worldwideZoom);
  const last = readMapWaterColor((layer, prop) => paint[layer]?.[prop]);
  assert.equal(zoomed, STREETS_LOW_ZOOM_OCEAN);
  assert.equal(last, 'rgb(153, 221, 255)');
  assert.notEqual(zoomed, last);
  assert.deepEqual(formatCssRgb([97.2, 202.4, 255, 1]), 'rgb(97, 202, 255)');
  assert.equal(resolveWaterFillCss('rgb(153, 221, 255)', 0.58), STREETS_LOW_ZOOM_OCEAN);
  assert.equal(resolveWaterFillCss('rgb(153, 221, 255)', STREETS_LOW_ZOOM_OCEAN_MAX), STREETS_LOW_ZOOM_OCEAN);
  assert.equal(resolveWaterFillCss('rgb(153, 221, 255)', 11), 'rgb(153, 221, 255)');
  const constantWater: Record<string, Record<string, unknown>> = {
    water: { 'fill-color': 'hsl(200, 100%, 80%)' },
  };
  assert.equal(
    readMapWaterColor((layer, prop) => constantWater[layer]?.[prop], worldwideZoom),
    STREETS_LOW_ZOOM_OCEAN
  );
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
  center = { lng: -20, lat: 20 };
  width = 1440;
  height = 900;
  /** Degrees per CSS pixel — enough to see a half-padding shift. */
  degPerPx = 0.01;
  methods: string[] = [];
  /** When true, flyTo finishes synchronously like prefers-reduced-motion → jumpTo. */
  reducedMotion = false;
  private flying = false;
  private pending: Array<() => void> = [];

  getPadding() {
    return { ...this.padding };
  }

  getCanvas() {
    return { clientWidth: this.width, clientHeight: this.height };
  }

  paddedCenter() {
    return {
      x: (this.width + (this.padding.left ?? 0) - (this.padding.right ?? 0)) / 2,
      y: (this.height + (this.padding.top ?? 0) - (this.padding.bottom ?? 0)) / 2,
    };
  }

  unproject([x, y]: [number, number]) {
    const c = this.paddedCenter();
    return {
      lng: this.center.lng + (x - c.x) * this.degPerPx,
      lat: this.center.lat - (y - c.y) * this.degPerPx,
    };
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

  private applyCamera(options: {
    padding?: Partial<typeof ZERO_PADDING>;
    duration?: number;
    center?: [number, number];
  }) {
    if (this.flying) {
      this.flying = false;
      this.emitMoveend();
    }
    if (options.center) {
      this.center = { lng: options.center[0], lat: options.center[1] };
    }
    if (options.padding) {
      this.padding = { ...ZERO_PADDING, ...options.padding };
    }
    // mapbox-gl 3.33: duration 0 (and reduced-motion jumpTo) fires moveend
    // inside flyTo(), before a listener attached afterward can see it.
    if (options.duration === 0 || this.reducedMotion) {
      this.flying = false;
      this.emitMoveend();
      return;
    }
    this.flying = true;
  }

  flyTo(options: { padding?: Partial<typeof ZERO_PADDING>; duration?: number; center?: [number, number] }) {
    this.methods.push('flyTo');
    this.applyCamera(options);
  }

  easeTo(options: { padding?: Partial<typeof ZERO_PADDING>; duration?: number; center?: [number, number] }) {
    this.methods.push('easeTo');
    this.applyCamera(options);
  }

  jumpTo(options?: { center?: [number, number]; padding?: Partial<typeof ZERO_PADDING> }) {
    this.methods.push('jumpTo');
    if (options?.center) {
      this.center = { lng: options.center[0], lat: options.center[1] };
    }
    if (options?.padding) {
      this.padding = { ...ZERO_PADDING, ...options.padding };
    }
  }

  setCenter() {
    this.methods.push('setCenter');
  }

  isMoving() {
    return this.flying;
  }

  endFlight() {
    this.flying = false;
    this.emitMoveend();
  }
}

/** Mirrors PlacesMap: replace in-flight cameras through startCameraAnimation. */
function startPlacesMapFlight(
  map: InterruptibleMap,
  handlerRef: { current: (() => void) | null }
) {
  startCameraAnimation(
    map,
    handlerRef,
    'flyTo',
    { padding: { ...ZERO_PADDING, left: 396 } },
    (reason: CameraEndReason = 'complete') => {
      if (reason === 'complete') clearPaddingKeepView(map);
    }
  );
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

test('replacing an in-flight camera animation runs the previous onEnd once as interrupted', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const first: CameraEndReason[] = [];
  const second: CameraEndReason[] = [];
  startCameraAnimation(map, handlerRef, 'flyTo', { center: [0, 0] }, (reason = 'complete') => {
    first.push(reason);
  });
  startCameraAnimation(map, handlerRef, 'easeTo', { center: [1, 1] }, (reason = 'complete') => {
    second.push(reason);
  });
  assert.deepEqual(first, ['interrupted']);
  map.endFlight();
  assert.deepEqual(first, ['interrupted']);
  assert.deepEqual(second, ['complete']);
  map.endFlight();
  assert.deepEqual(first, ['interrupted']);
  assert.deepEqual(second, ['complete']);
});

/**
 * Page + PlacesMap session: flyRequest keeps cameraBusy true until
 * onFlyComplete(nonce) runs. Zoom / cluster / locate replace the camera
 * through startCameraAnimation.
 */
function createBusyFlightSession() {
  let flyRequest: { nonce: number } | null = { nonce: 1 };
  let mapCameraBusy = false;
  let jumpTo = 0;
  const presetReasons: CameraEndReason[] = [];
  const cameraBusy = () => Boolean(flyRequest) || mapCameraBusy;
  let leftPreset = false;
  let lastKey = 'preset:london';
  let pendingSearch: { requestId: number } | null = { requestId: 1 };
  let heading = createListHeadingMachine();
  heading = startListHeadingRequest(heading);
  const handleFlyComplete = (nonce?: number, kind?: FlightEndKind) => {
    if (!flyRequest) return;
    if (nonce != null && flyRequest.nonce !== nonce) return;
    flyRequest = null;
    if (kind === 'user-interrupt') {
      heading = startListHeadingRequest(heading);
      pendingSearch = null;
      lastKey = 'current-bounds';
      leftPreset = true;
    }
  };
  const onPresetEnd = (reason: CameraEndReason = 'complete') => {
    presetReasons.push(reason);
    if (reason === 'complete') jumpTo += 1;
    mapCameraBusy = false;
    handleFlyComplete(1);
  };
  return {
    cameraBusy,
    handleFlyComplete,
    onPresetEnd,
    presetReasons,
    get flyRequest() {
      return flyRequest;
    },
    set flyRequest(next: { nonce: number } | null) {
      flyRequest = next;
    },
    get jumpTo() {
      return jumpTo;
    },
    get mapCameraBusy() {
      return mapCameraBusy;
    },
    set mapCameraBusy(next: boolean) {
      mapCameraBusy = next;
    },
    get leftPreset() {
      return leftPreset;
    },
    get lastKey() {
      return lastKey;
    },
    get pendingSearch() {
      return pendingSearch;
    },
    get heading() {
      return heading;
    },
    set lastKey(next: string) {
      lastKey = next;
    },
    set leftPreset(next: boolean) {
      leftPreset = next;
    },
  };
}

function assertIdleSearchCommits(session: { cameraBusy: () => boolean }) {
  assert.equal(session.cameraBusy(), false);
  const decision = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'after-interrupt',
    lastPresetKey: 'preset:united-states',
    cameraBusy: session.cameraBusy(),
  });
  assert.equal(decision.action, 'moveend');
  let heading = createListHeadingMachine();
  heading = startListHeadingRequest(heading);
  heading = startListHeadingRequest(heading);
  assert.equal(shouldCommitSearchUi({ requestId: 2, machine: heading, cameraBusy: true }), false);
  assert.equal(shouldCommitSearchUi({ requestId: 2, machine: heading, cameraBusy: session.cameraBusy() }), true);
}

for (const interrupt of [
  { name: 'Zoom', method: 'easeTo' as const, options: { duration: 220, zoom: 6 } },
  { name: 'cluster click', method: 'easeTo' as const, options: { duration: 480, zoom: 8 } },
  { name: 'Locate me', method: 'flyTo' as const, options: { duration: 1600, center: [0, 0] } },
]) {
  test(`interrupted preset flight (${interrupt.name}) clears flyRequest and lets the next settle search`, () => {
    const map = new InterruptibleMap();
    const handlerRef: { current: (() => void) | null } = { current: null };
    const session = createBusyFlightSession();
    session.mapCameraBusy = true;
    startCameraAnimation(map, handlerRef, 'flyTo', { duration: 2000, center: [-20, 20] }, session.onPresetEnd);
    assert.equal(session.cameraBusy(), true);
    assert.ok(session.flyRequest);

    let replacementEnds = 0;
    startCameraAnimation(map, handlerRef, interrupt.method, interrupt.options, () => {
      replacementEnds += 1;
      session.mapCameraBusy = false;
    });
    if (handlerRef.current) session.mapCameraBusy = true;
    assert.deepEqual(session.presetReasons, ['interrupted']);
    assert.equal(session.flyRequest, null, 'interrupted preset must release flyRequest');
    assert.equal(session.jumpTo, 0, 'interrupt must not padding-clear jumpTo');
    assert.equal(session.cameraBusy(), true, 'replacement camera is still busy');
    assert.equal(replacementEnds, 0);

    map.endFlight();
    assert.equal(replacementEnds, 1);
    assert.equal(session.presetReasons.length, 1);
    assertIdleSearchCommits(session);
  });
}

test('preset interrupted by another preset keeps the new flyRequest', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const session = createBusyFlightSession();
  session.mapCameraBusy = true;
  startCameraAnimation(map, handlerRef, 'flyTo', { duration: 2000, center: [139, 35] }, session.onPresetEnd);
  session.flyRequest = { nonce: 2 };
  session.mapCameraBusy = true;
  let secondEnds = 0;
  startCameraAnimation(map, handlerRef, 'flyTo', { duration: 1800, center: [-100, 40] }, (reason = 'complete') => {
    secondEnds += 1;
    if (reason === 'complete') session.mapCameraBusy = false;
    session.handleFlyComplete(2);
  });
  assert.deepEqual(session.presetReasons, ['interrupted']);
  assert.deepEqual(session.flyRequest, { nonce: 2 });
  assert.equal(session.jumpTo, 0);
  map.endFlight();
  assert.equal(secondEnds, 1);
  assert.equal(session.flyRequest, null);
  assert.equal(session.cameraBusy(), false);
});

test('resize mid-flight replaces the camera without a padding-clear jumpTo', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const session = createBusyFlightSession();
  session.mapCameraBusy = true;
  startCameraAnimation(map, handlerRef, 'flyTo', { duration: 2000, center: [139, 35] }, session.onPresetEnd);
  session.flyRequest = { nonce: 3 };
  session.mapCameraBusy = true;
  startCameraAnimation(map, handlerRef, 'easeTo', { duration: 0, center: [-20, 20] }, (reason = 'complete') => {
    session.mapCameraBusy = false;
    session.handleFlyComplete(3);
    assert.equal(reason, 'complete');
  });
  assert.deepEqual(session.presetReasons, ['interrupted']);
  assert.equal(session.jumpTo, 0);
  assert.equal(session.flyRequest, null);
  assert.equal(session.cameraBusy(), false);
});

test('user wheel mid-flight still completes the end handler once', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const session = createBusyFlightSession();
  session.mapCameraBusy = true;
  startCameraAnimation(map, handlerRef, 'flyTo', { duration: 2000, center: [-20, 20] }, session.onPresetEnd);
  map.endFlight();
  assert.deepEqual(session.presetReasons, ['complete']);
  assert.equal(session.flyRequest, null);
  assert.equal(session.cameraBusy(), false);
  map.endFlight();
  assert.deepEqual(session.presetReasons, ['complete']);
});

test('abandonCameraAnimation on unmount drops the listener without clearing flyRequest', () => {
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const session = createBusyFlightSession();
  session.mapCameraBusy = true;
  startCameraAnimation(map, handlerRef, 'flyTo', { duration: 2000, center: [-20, 20] }, session.onPresetEnd);
  abandonCameraAnimation(map, handlerRef);
  session.mapCameraBusy = false;
  assert.ok(session.flyRequest);
  assert.deepEqual(session.presetReasons, []);
  map.endFlight();
  assert.deepEqual(session.presetReasons, []);
});

test('classifyFlightEnd: only real user input is an interrupt; clamp/resize misses stay complete', () => {
  assert.equal(
    classifyFlightEnd({ animationReason: 'interrupted', reachedTarget: false, userInputActive: false }),
    'replaced'
  );
  assert.equal(
    classifyFlightEnd({ animationReason: 'complete', reachedTarget: false, userInputActive: false }),
    'complete'
  );
  assert.equal(
    classifyFlightEnd({ animationReason: 'complete', reachedTarget: true, userInputActive: true }),
    'user-interrupt'
  );
  assert.equal(
    classifyFlightEnd({ animationReason: 'complete', reachedTarget: true, userInputActive: false }),
    'complete'
  );
  assert.equal(
    cameraReachedTarget({ lng: -20, lat: 20, zoom: 0.81 }, { lng: -20, lat: 20, zoom: 0.459 }),
    false
  );
  assert.equal(
    classifyFlightEnd({
      animationReason: 'complete',
      reachedTarget: cameraReachedTarget(
        { lng: -20, lat: 20, zoom: 0.81 },
        { lng: -20, lat: 20, zoom: 0.459 }
      ),
      userInputActive: false,
    }),
    'complete'
  );
});

test('768 Worldwide with no interrupt keeps Worldwide', () => {
  const kind = classifyFlightEnd({
    animationReason: 'complete',
    reachedTarget: false,
    userInputActive: false,
  });
  assert.equal(kind, 'complete');
  const worldwide = LOCATION_PRESETS.find((item) => item.id === 'worldwide')!;
  let heading = createListHeadingMachine();
  heading = startListHeadingRequest(heading);
  heading = settleListHeadingRequest(
    heading,
    1,
    { shown: 82, total: 82, hasMore: false, places: [] },
    { hasMap: true, zoom: 0.459, location: worldwide, leftPreset: false }
  );
  assert.equal(heading.heading?.chipLabel, 'Worldwide');
  const decision = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: 'ww-live-bounds',
    lastPresetKey: '',
    cameraBusy: false,
    settleKey: 'preset:worldwide',
  });
  assert.equal(decision.action, 'filters');
  assert.equal(decision.nextPresetKey, 'preset:worldwide');
});

test('resize on Worldwide keeps the chip and does not search', () => {
  const resize = cameraMoveendEffects({}, 'resize', { zoomChanged: true });
  assert.equal(resize.leavePreset, false);
  assert.equal(isUserMapMove({}, null, { zoomChanged: true }), false);
  const afterClamp = cameraMoveendEffects({}, null, { zoomChanged: true });
  assert.equal(afterClamp.leavePreset, false);
  const decision = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: 'resized-bounds',
    lastPresetKey: 'preset:worldwide',
    cameraBusy: false,
    settleKey: 'preset:worldwide',
  });
  assert.equal(decision.action, 'skip');
});

test('user interrupt of a preset cancels settle and bounds-searches Map area once', () => {
  const session = createBusyFlightSession();
  const kind = classifyFlightEnd({
    animationReason: 'complete',
    userInputActive: true,
  });
  assert.equal(kind, 'user-interrupt');
  session.handleFlyComplete(1, kind);
  assert.equal(session.flyRequest, null);
  assert.equal(session.leftPreset, true);
  assert.equal(session.pendingSearch, null);
  assert.equal(shouldApplySettledSearch(1, session.heading), false);

  assert.equal(
    searchAfterViewportChange({
      leftPreset: session.leftPreset,
      boundsKey: session.lastKey,
      lastPresetKey: session.lastKey,
      cameraBusy: false,
    }).action,
    'skip',
    'interrupt must not search until bounds change'
  );

  const decision = searchAfterViewportChange({
    leftPreset: session.leftPreset,
    boundsKey: 'mid-flight-stop',
    lastPresetKey: session.lastKey,
    cameraBusy: false,
  });
  assert.equal(decision.action, 'moveend');
  assert.equal(decision.nextPresetKey, 'mid-flight-stop');
});

test('replaced preset does not flip to Map area so the newest preset settle wins', () => {
  const session = createBusyFlightSession();
  session.flyRequest = { nonce: 2 };
  const kind = classifyFlightEnd({
    animationReason: 'interrupted',
    reachedTarget: false,
    userInputActive: false,
  });
  assert.equal(kind, 'replaced');
  session.handleFlyComplete(1, kind);
  assert.deepEqual(session.flyRequest, { nonce: 2 });
  assert.equal(session.leftPreset, false);
  assert.equal(session.lastKey, 'preset:london');

  const tokyo = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: 'map-area-stop',
    lastPresetKey: '',
    cameraBusy: false,
    settleKey: 'preset:tokyo',
  });
  assert.equal(tokyo.action, 'filters');
  assert.equal(tokyo.nextPresetKey, 'preset:tokyo');
});

test('zoomChanged during a preset tag does not leave the chip', () => {
  const effects = cameraMoveendEffects({}, 'preset', { zoomChanged: true });
  assert.equal(effects.leavePreset, false);
  assert.equal(effects.reportBounds, false);
  const afterWipe = cameraMoveendEffects({}, null, { zoomChanged: true });
  assert.equal(afterWipe.leavePreset, false, 'clamp/resize zoomChanged without user input must not leave');
});

test('cluster mousedown during a programmatic flight is queued', () => {
  assert.equal(shouldQueueClusterExpand('preset', { cluster_id: 42 }), true);
  assert.equal(shouldQueueClusterExpand('place', { cluster: true }), true);
  assert.equal(shouldQueueClusterExpand(null, { cluster_id: 42 }), false);
  assert.equal(shouldQueueClusterExpand('resize', { cluster_id: 42 }), false);
  assert.equal(shouldQueueClusterExpand('preset', {}), false);
});

test('drag-from-cluster does not expand', () => {
  const start = { x: 100, y: 80, at: 1_000 };
  assert.equal(
    isGenuineClusterClick({ start, end: { x: 101, y: 81, at: 1_120 } }),
    true
  );
  assert.equal(
    isGenuineClusterClick({ start, end: { x: 120, y: 80, at: 1_120 } }),
    false
  );
  assert.equal(clusterPointerMoved(start, { x: 106, y: 80 }), true);
  assert.equal(clusterPointerMoved(start, { x: 103, y: 82 }), false);
  assert.equal(
    isGenuineClusterClick({ start, end: { x: 101, y: 81, at: 1_400 } }),
    false
  );
  assert.equal(
    isGenuineClusterClick({ start, end: { x: 101, y: 81, at: 1_120 }, cancelled: true }),
    false
  );
});

test('cluster click mid-flight never gets stuck', () => {
  const session = createBusyFlightSession();
  session.handleFlyComplete(
    1,
    classifyFlightEnd({ animationReason: 'complete', userInputActive: true })
  );
  assert.equal(session.leftPreset, true);
  assert.equal(session.flyRequest, null);
  assert.equal(session.cameraBusy(), false);
  assert.equal(shouldApplySettledSearch(1, session.heading), false);

  const queued = shouldQueueClusterExpand('preset', { cluster_id: 7 });
  const dragged = clusterPointerMoved({ x: 10, y: 10 }, { x: 40, y: 12 });
  assert.equal(queued, true);
  assert.equal(dragged, true);

  const afterFailOpen = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'stopped-here',
    lastPresetKey: session.lastKey,
    cameraBusy: false,
  });
  assert.equal(afterFailOpen.action, 'moveend');

  const afterDrag = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'later-drag',
    lastPresetKey: afterFailOpen.nextPresetKey ?? session.lastKey,
    cameraBusy: false,
  });
  assert.equal(afterDrag.action, 'moveend');
});

test('a mid-flight drag searches once at the drag end', () => {
  assert.equal(shouldSearchOnUserMoveend({ pointerDown: true }), false);
  assert.equal(shouldSearchOnUserMoveend({ pointerDown: false }), true);

  let lastKey = 'preset:london';
  const searches: string[] = [];
  const consider = (pointerDown: boolean, boundsKey: string) => {
    if (!shouldSearchOnUserMoveend({ pointerDown })) return;
    const decision = searchAfterViewportChange({
      leftPreset: true,
      boundsKey,
      lastPresetKey: lastKey,
      cameraBusy: false,
    });
    if (decision.action === 'skip') return;
    lastKey = decision.nextPresetKey ?? boundsKey;
    searches.push(boundsKey);
  };
  consider(true, 'stop-mid-flight');
  consider(true, 'still-dragging');
  consider(false, 'drag-end');
  assert.deepEqual(searches, ['drag-end']);
});

test('zoom interrupting a card fly lets the next drag search', () => {
  let lastKey = 'place-bounds';
  const handleUserCameraMove = () => {
    lastKey = 'place-bounds';
  };
  handleUserCameraMove();
  const afterZoom = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'zoom-end-bounds',
    lastPresetKey: lastKey,
    cameraBusy: false,
  });
  assert.equal(afterZoom.action, 'moveend');
  lastKey = afterZoom.nextPresetKey ?? lastKey;
  const drag = cameraMoveendEffects({ originalEvent: { type: 'mouseup' } }, 'zoom');
  assert.equal(drag.leavePreset, true);
  assert.equal(drag.reportBounds, true);
  const afterDrag = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'drag-bounds',
    lastPresetKey: lastKey,
    cameraBusy: false,
  });
  assert.equal(afterDrag.action, 'moveend');
});

test('flyTo options use a gentle curve and an explicit duration cap', () => {
  const fly = cameraFlyOptions({ center: [1, 2], zoom: 4, duration: 1500 });
  assert.equal(fly.speed, undefined);
  assert.equal(fly.curve, CAMERA_FLY.curve);
  assert.equal(fly.duration, 1500);
  assert.equal(fly.easing, easeOutCubic);
  const ease = cameraEaseOptions(560, { zoom: 8 });
  assert.equal(ease.duration, 560);
  assert.equal(ease.speed, undefined);
  assert.equal(isShortCameraHop('cluster'), true);
  assert.equal(isShortCameraHop('zoom'), true);
  assert.equal(isShortCameraHop('drawer'), true);
  assert.equal(isShortCameraHop('preset'), false);
  assert.equal(isShortCameraHop('place'), false);
});

test('clearPaddingKeepView is a no-op when padding is already zero', () => {
  const calls = { jumpTo: 0, flyTo: 0, easeTo: 0, setCenter: 0 };
  const zeroMap = {
    getPadding: () => ({ ...ZERO_PADDING }),
    getCanvas: () => ({ clientWidth: 1440, clientHeight: 900 }),
    unproject: () => ({ lng: 1, lat: 2 }),
    jumpTo: () => {
      calls.jumpTo += 1;
    },
    flyTo: () => {
      calls.flyTo += 1;
    },
    easeTo: () => {
      calls.easeTo += 1;
    },
    setCenter: () => {
      calls.setCenter += 1;
    },
  };
  assert.equal(paddingIsZero(ZERO_PADDING), true);
  assert.equal(clearPaddingKeepView(zeroMap), false);
  assert.deepEqual(calls, { jumpTo: 0, flyTo: 0, easeTo: 0, setCenter: 0 });
});

test('in-flight tags suppress viewport reports until the final moveend', () => {
  assert.equal(isProgrammaticFlightTag('preset'), true);
  assert.equal(isProgrammaticFlightTag('place'), true);
  assert.equal(isProgrammaticFlightTag('cluster'), true);
  assert.equal(isProgrammaticFlightTag('resize'), false);
  assert.equal(shouldReportViewport('preset'), false);
  assert.equal(shouldReportViewport('place'), false);
  assert.equal(shouldReportViewport('cluster'), false);
  assert.equal(shouldReportViewport('resize'), true);
  assert.equal(shouldReportViewport(null), true);
});

test('a preset produces exactly one camera method call including setCenter/jumpTo/easeTo', () => {
  const methods: string[] = [];
  const map = {
    flyTo: (options: Record<string, unknown>) => {
      methods.push('flyTo');
      return options;
    },
    easeTo: () => {
      methods.push('easeTo');
    },
    jumpTo: () => {
      methods.push('jumpTo');
    },
    setCenter: () => {
      methods.push('setCenter');
    },
    once: () => undefined,
    off: () => undefined,
    isMoving: () => false,
    getPadding: () => ({ ...ZERO_PADDING }),
    getCanvas: () => ({ clientWidth: 1440, clientHeight: 900 }),
    unproject: () => ({ lng: -20, lat: 20 }),
  };
  const handlerRef: { current: (() => void) | null } = { current: null };
  const started: { current: number | null } = { current: null };
  const tokyo = { lng: 139.6503, lat: 35.6762, zoom: 11 };
  const worldwide = presetFlyCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    { width: 1440, height: 900 }
  );
  const nonce = 42;
  assert.equal(claimFlyNonce(started, nonce), true);
  const move = pickCameraAnimation('preset', tokyo, worldwide);
  assert.equal(move.method, 'flyTo');
  assert.ok(move.duration <= CAMERA_DURATION_CAP.presetMax);
  startCameraAnimation(
    map,
    handlerRef,
    move.method,
    cameraFlyOptions({
      center: [worldwide.lng, worldwide.lat],
      zoom: worldwide.zoom,
      duration: move.duration,
      padding: ZERO_PADDING,
      retainPadding: false,
    }),
    () => {
      clearPaddingKeepView(map);
    }
  );
  assert.equal(claimFlyNonce(started, nonce), false);
  assert.deepEqual(methods, ['flyTo']);
  assert.ok(move.duration + 200 <= 2600);
  assert.equal(claimFlyNonce(started, nonce + 1), true);
});

test('unpadded preset fly has no extra jumpTo; padded flight may add one', () => {
  const flyToCalls: Array<Record<string, unknown>> = [];
  const jumpToCalls: Array<Record<string, unknown>> = [];
  const unpadded = {
    flyTo: (options: Record<string, unknown>) => {
      flyToCalls.push(options);
    },
    easeTo: () => undefined,
    jumpTo: (options: Record<string, unknown>) => {
      jumpToCalls.push(options);
    },
    once: () => undefined,
    off: () => undefined,
    isMoving: () => false,
    getPadding: () => ({ ...ZERO_PADDING }),
    getCanvas: () => ({ clientWidth: 1440, clientHeight: 900 }),
    unproject: () => ({ lng: -20, lat: 20 }),
    setCenter: () => {
      jumpToCalls.push({ setCenter: true });
    },
  };
  const handlerRef: { current: (() => void) | null } = { current: null };
  startCameraAnimation(
    unpadded,
    handlerRef,
    'flyTo',
    cameraFlyOptions({
      center: [-20, 20],
      zoom: 1.15,
      duration: 1800,
      padding: ZERO_PADDING,
      retainPadding: false,
    }),
    () => {
      clearPaddingKeepView(unpadded);
    }
  );
  assert.equal(flyToCalls.length, 1);
  assert.equal(jumpToCalls.length, 0);

  const padded = new InterruptibleMap();
  padded.padding = { ...ZERO_PADDING, right: 496 };
  startCameraAnimation(
    padded,
    handlerRef,
    'flyTo',
    { duration: 0, center: [-111.94, 33.425], padding: { ...ZERO_PADDING, right: 496 } },
    () => {
      clearPaddingKeepView(padded);
    }
  );
  const cameraCalls = padded.methods.filter(
    (name) => name === 'flyTo' || name === 'easeTo' || name === 'jumpTo' || name === 'setCenter'
  );
  assert.equal(cameraCalls[0], 'flyTo');
  assert.ok(
    cameraCalls.length === 1 || (cameraCalls.length === 2 && cameraCalls[1] === 'jumpTo'),
    'a padded flight may add one jumpTo to clear padding'
  );
  assert.deepEqual(padded.getPadding(), ZERO_PADDING);
});

test('place and preset flights stay inside the 1.2–1.8s / 2.2s caps', () => {
  const us = { lng: -98.5795, lat: 39.8283, zoom: 3.4 };
  const tempe = { lng: -111.94, lat: 33.425, zoom: 12 };
  const worldwide = { lng: -20, lat: 20, zoom: 1.15 };
  const far = cameraSeparation(us, tempe);
  assert.ok(far > 10);
  assert.ok(!isShortPlaceHop(far));
  assert.ok(cappedFlyDuration('place', far) <= CAMERA_DURATION_CAP.placeMax);
  assert.equal(cappedFlyDuration('place', 200), CAMERA_DURATION_CAP.placeMax);
  assert.ok(cappedFlyDuration('preset', 200) <= CAMERA_DURATION_CAP.presetMax);
  const place = pickCameraAnimation('place', us, tempe);
  assert.equal(place.method, 'flyTo');
  assert.ok(place.duration >= 1200 && place.duration <= 1800);
  const preset = pickCameraAnimation('preset', us, worldwide);
  assert.equal(preset.method, 'flyTo');
  assert.ok(preset.duration <= 2200);
  const near = pickCameraAnimation('place', tempe, { lng: -111.93, lat: 33.43, zoom: 12 });
  assert.equal(near.method, 'easeTo');
  assert.equal(near.duration, CAMERA_DURATION.placeShort);
  const drawer = pickCameraAnimation('drawer', tempe, tempe);
  assert.equal(drawer.method, 'easeTo');
  assert.equal(drawer.duration, CAMERA_DURATION.drawer);
});

test('flyToThenOnMoveend still attaches after start', () => {
  const map = new InterruptibleMap();
  let ended = 0;
  flyToThenOnMoveend(map, { padding: ZERO_PADDING }, () => {
    ended += 1;
  });
  assert.equal(ended, 0);
  map.endFlight();
  assert.equal(ended, 1);
});

test('instant flyTo (duration 0) runs the end handler even when moveend is synchronous', () => {
  const map = new InterruptibleMap();
  let ended = 0;
  flyToThenOnMoveend(map, { duration: 0, padding: { ...ZERO_PADDING, left: 396 } }, () => {
    ended += 1;
    map.padding = { ...ZERO_PADDING };
  });
  assert.equal(ended, 1);
  assert.equal(map.isMoving(), false);
  assert.deepEqual(map.getPadding(), ZERO_PADDING);
  map.endFlight();
  assert.equal(ended, 1);
});

test('prefers-reduced-motion flyTo (sync moveend, duration > 0) still runs the end handler', () => {
  const map = new InterruptibleMap();
  map.reducedMotion = true;
  let ended = 0;
  flyToThenOnMoveend(map, { duration: 900 }, () => {
    ended += 1;
  });
  assert.equal(ended, 1);
  assert.equal(map.isMoving(), false);
  map.endFlight();
  assert.equal(ended, 1);
});

test('camera end handler fires exactly once for instant and animated moves', () => {
  const handlerRef: { current: (() => void) | null } = { current: null };

  const instant = new InterruptibleMap();
  let instantEnds = 0;
  startCameraAnimation(instant, handlerRef, 'flyTo', { duration: 0, center: [0, 0] }, () => {
    instantEnds += 1;
  });
  assert.equal(instantEnds, 1);
  assert.equal(instant.isMoving(), false);
  instant.endFlight();
  assert.equal(instantEnds, 1);

  const reduced = new InterruptibleMap();
  reduced.reducedMotion = true;
  let reducedEnds = 0;
  startCameraAnimation(reduced, handlerRef, 'easeTo', { duration: 560, center: [1, 1] }, () => {
    reducedEnds += 1;
  });
  assert.equal(reducedEnds, 1);
  assert.equal(reduced.isMoving(), false);
  reduced.endFlight();
  assert.equal(reducedEnds, 1);

  const animated = new InterruptibleMap();
  let animatedEnds = 0;
  startCameraAnimation(animated, handlerRef, 'flyTo', { duration: 1800, center: [-20, 20] }, () => {
    animatedEnds += 1;
  });
  assert.equal(animatedEnds, 0);
  assert.equal(animated.isMoving(), true);
  animated.endFlight();
  assert.equal(animatedEnds, 1);
  animated.endFlight();
  assert.equal(animatedEnds, 1);
});

test('reduced motion + 768 Worldwide: short canvas, width-fit zoom, one camera call', () => {
  const viewport = { width: 768, height: 900 };
  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    768,
    900,
    { left: 0, right: 0 }
  );
  const full = { top: 0, height: 900 };
  let state = createCanvasMachine(viewport);
  state = reduceCanvasMachine(state, { type: 'prepareFlight', targetZoom: camera.zoom, viewport });
  assert.equal(canvasReadyForFlight(full, state.box), false, 'must not fly until the short box is committed');
  assert.equal(canvasReadyForFlight(state.box, state.box), true);
  assert.ok(state.box.height < 900);
  assert.ok(mapboxHeightMinZoom(state.box.height) <= camera.zoom + 1e-9);
  assert.ok(camera.zoom <= Math.log2(768 / MERCATOR_TILE_SIZE) + 1e-9);

  const map = new InterruptibleMap();
  map.reducedMotion = true;
  const handlerRef: { current: (() => void) | null } = { current: null };
  let ends = 0;
  const flightPadding = ZERO_PADDING;
  startCameraAnimation(
    map,
    handlerRef,
    'flyTo',
    {
      duration: 900,
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      padding: flightPadding,
    },
    () => {
      ends += 1;
      if (shouldClearPaddingAfterFlight(flightPadding, map.getPadding())) {
        clearPaddingKeepView(map);
      }
    }
  );
  const cameraCalls = map.methods.filter((name) =>
    name === 'flyTo' || name === 'easeTo' || name === 'jumpTo' || name === 'setCenter'
  );
  assert.deepEqual(cameraCalls, ['flyTo']);
  assert.equal(ends, 1);
  assert.equal(map.isMoving(), false);
  map.endFlight();
  assert.equal(ends, 1);
});

test('preset with zero padding is exactly one camera call', () => {
  assert.equal(shouldClearPaddingAfterFlight(ZERO_PADDING, ZERO_PADDING), false);
  assert.equal(shouldClearPaddingAfterFlight(ZERO_PADDING, { ...ZERO_PADDING, right: 400 }), false);
  assert.equal(shouldClearPaddingAfterFlight({ ...ZERO_PADDING, right: 400 }, ZERO_PADDING), false);
  assert.equal(
    shouldClearPaddingAfterFlight({ ...ZERO_PADDING, right: 400 }, { ...ZERO_PADDING, right: 400 }),
    true
  );

  const camera = presetCamera(
    { id: 'worldwide', lat: 20, lng: -20, zoom: 1.15, radiusKm: 20000 },
    768,
    900,
    { left: 0, right: 0 }
  );
  const map = new InterruptibleMap();
  const handlerRef: { current: (() => void) | null } = { current: null };
  const flightPadding = flyPadding(false, true, { width: 768, height: 704 }, true, 0);
  assert.equal(paddingIsZero(flightPadding), true);
  startCameraAnimation(
    map,
    handlerRef,
    'flyTo',
    {
      duration: 900,
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      padding: flightPadding,
    },
    () => {
      if (shouldClearPaddingAfterFlight(flightPadding, map.getPadding())) {
        clearPaddingKeepView(map);
      }
    }
  );
  map.endFlight();
  assert.deepEqual(
    map.methods.filter((name) => name === 'flyTo' || name === 'easeTo' || name === 'jumpTo' || name === 'setCenter'),
    ['flyTo']
  );
});

test('user zoom-in grows the short canvas after a padding clear', () => {
  const viewport = { width: 768, height: 900 };
  const target = narrowWidthFitZoom(768);
  const clamp = mapboxHeightMinZoom(900);
  let state = reduceCanvasMachine(createCanvasMachine(viewport), {
    type: 'prepareFlight',
    targetZoom: target,
  });
  state = reduceCanvasMachine(state, { type: 'flightEnd', zoom: target });
  const short = state.box.height;
  assert.ok(short < 900);

  const applyMove = (
    current: typeof state,
    tag: string | null,
    event: { originalEvent?: { type?: string } },
    prevZoom: number,
    nextZoom: number
  ) => {
    if (isProgrammaticCanvasMove(tag, event)) {
      return reduceCanvasMachine(current, { type: 'flightProgress', zoom: nextZoom });
    }
    return reduceCanvasMachine(current, { type: 'userZoom', zoom: nextZoom, prevZoom });
  };

  // Padding-clear jumpTo is tagged resize and has no gesture — no grow.
  state = applyMove(state, 'resize', {}, target, target);
  assert.equal(state.box.height, short);
  assert.equal(state.shortened, true);

  // Mid-flight tags stay locked unless a real wheel/gesture comes through.
  for (const tag of ['preset', 'place', 'drawer', 'cluster', 'zoom', 'locate', 'programmatic'] as const) {
    const locked = applyMove(state, tag, {}, target, clamp);
    assert.equal(locked.box.height, short, tag);
  }

  // A leaked resize tag must not block a real wheel zoom-in at the floor.
  state = applyMove(state, 'resize', { originalEvent: { type: 'wheel' } }, target, clamp);
  assert.equal(state.box.height, 900);
  assert.equal(state.shortened, false);
  assert.equal(isUserGestureEvent({ originalEvent: { type: 'wheel' } }), true);
  assert.equal(isUserGestureEvent({}), false);
});

function visualCenter(map: InterruptibleMap) {
  const canvas = map.getCanvas();
  return map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
}

test('clearPaddingKeepView keeps the visual centre via jumpTo', () => {
  const map = new InterruptibleMap();
  map.padding = { ...ZERO_PADDING, right: 400 };
  map.center = { lng: -111.94, lat: 33.425 };
  const before = visualCenter(map);
  const shiftedIfUncentered = {
    lng: map.center.lng,
    lat: map.center.lat,
  };
  assert.notEqual(before.lng, shiftedIfUncentered.lng);
  assert.equal(clearPaddingKeepView(map), true);
  assert.deepEqual(visualCenter(map), before);
  assert.deepEqual(map.getPadding(), ZERO_PADDING);
  assert.ok(map.methods.includes('jumpTo'));
  assert.equal(clearPaddingKeepView(map), false);
});

test('padding-clear jumpTo updates bounds and search without flipping the chip', () => {
  const effects = cameraMoveendEffects({}, 'resize');
  assert.equal(effects.leavePreset, false);
  assert.equal(effects.reportBounds, true);
  assert.equal(shouldReportViewport('resize'), true);
  assert.equal(isUserMapMove({}, 'resize'), false);

  const unitedStates = LOCATION_PRESETS.find((item) => item.id === 'united-states')!;
  let heading = createListHeadingMachine();
  heading = startListHeadingRequest(heading);
  heading = settleListHeadingRequest(
    heading,
    1,
    { shown: 1, total: 1, hasMore: false, places: [{ city: 'Tempe' }] },
    { hasMap: true, zoom: 12, location: unitedStates, leftPreset: true }
  );
  assert.equal(heading.heading?.chipLabel, 'Map area');

  heading = startListHeadingRequest(heading);
  heading = settleListHeadingRequest(
    heading,
    2,
    { shown: 4, total: 4, hasMore: false, places: [{ city: 'Tempe' }] },
    { hasMap: true, zoom: 12, location: unitedStates, leftPreset: true }
  );
  assert.equal(shouldApplySettledSearch(2, heading), true);
  assert.equal(shouldApplySettledSearch(1, heading), false);
  assert.equal(listHeadingText(heading.heading), '4 places in this area');
  assert.equal(heading.heading?.chipLabel, 'Map area');
});

test('cluster expand with the drawer open is deterministic and does not stack padding', () => {
  const cluster = { lng: -111.94, lat: 33.425 };
  const size = { width: 1280, height: 900 };
  const intended = flyPadding(true, false, size);
  const leftover = { ...ZERO_PADDING, right: 496 };
  const first = clusterExpandCamera(cluster, 8, intended);
  const again = clusterExpandCamera(cluster, 8, intended);
  const fromLeftoverIfStacked = clusterExpandCamera(first.center, 8, leftover);
  assert.deepEqual(first, again);
  assert.deepEqual(first.padding, ZERO_PADDING);
  assert.equal(first.retainPadding, false);
  assert.notDeepEqual(
    fromLeftoverIfStacked.center,
    first.center,
    'a second easeTo that kept leftover padding would shift again'
  );
  const secondClick = clusterExpandCamera(cluster, 8, intended);
  assert.deepEqual(secondClick, first);
  assert.ok(intended.right > 0);
  assert.notEqual(first.center.lng, cluster.lng);
});

test('drawer close after a card fly does not shift the view', () => {
  const size = { width: 1280, height: 900 };
  const padding = flyPadding(true, false, size);
  assert.ok((padding.right ?? 0) > 0);
  const map = new InterruptibleMap();
  map.width = size.width;
  map.height = size.height;
  map.padding = { ...ZERO_PADDING, ...padding };
  map.center = { lng: -111.94, lat: 33.425 };
  const before = visualCenter(map);
  assert.equal(clearPaddingKeepView(map), true);
  assert.deepEqual(visualCenter(map), before);
  assert.deepEqual(map.getPadding(), ZERO_PADDING);
});
