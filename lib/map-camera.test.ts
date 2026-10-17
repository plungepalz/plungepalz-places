import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIST_PANEL_RIGHT,
  PACIFIC_SEAM_LNG,
  WORLDWIDE_COMFORT_LNG,
  ZERO_PADDING,
  flyToThenOnMoveend,
  lngScreenCopies,
  listPanelRightEdge,
  mapboxHeightMinZoom,
  worldwideFraming,
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
