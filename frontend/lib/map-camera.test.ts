import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIST_PANEL_RIGHT,
  PACIFIC_SEAM_LNG,
  WORLDWIDE_COMFORT_LNG,
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

function assertPlacesInGap(canvasWidth: number, canvasHeight: number) {
  const framing = worldwideFraming(canvasWidth, canvasHeight);
  assert.equal(framing.panelRight, LIST_PANEL_RIGHT);
  assert.equal(framing.lat, 20);
  for (const [name, lng] of PLACES) {
    const copies = lngScreenCopies(lng, framing.lng, framing.zoom, canvasWidth, framing.panelRight);
    const inGap = copies.some(
      (x) => x > framing.panelRight + CLUSTER_INSET && x < canvasWidth - CLUSTER_INSET
    );
    assert.ok(
      inGap,
      `${name} (${lng}) copies [${copies.map((x) => x.toFixed(1)).join(', ')}] must sit in the gap ` +
        `(${framing.panelRight + CLUSTER_INSET}..${canvasWidth - CLUSTER_INSET}) ` +
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
