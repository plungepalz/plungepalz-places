import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIST_PANEL_RIGHT, lngToVisibleX, listPanelRightEdge, worldFitZoom } from './map-camera';

const WORLDWIDE_LNG = -20;
const US_CLUSTER_LNG = -98.6;
const HAWAII_LNG = -157.8;
const FIJI_LNG = 178.0;

function assertWorldwideFraming(canvasWidth: number) {
  const panelRight = listPanelRightEdge(canvasWidth);
  const zoom = worldFitZoom(canvasWidth, panelRight);
  const visible = canvasWidth - panelRight;
  const worldPx = 512 * 2 ** zoom;
  assert.ok(worldPx <= visible + 1, `world ${worldPx}px must fit in visible ${visible}px at ${canvasWidth}`);
  for (const [name, lng] of [
    ['US cluster', US_CLUSTER_LNG],
    ['Hawaii', HAWAII_LNG],
    ['Fiji', FIJI_LNG],
  ] as const) {
    const x = lngToVisibleX(lng, WORLDWIDE_LNG, zoom, canvasWidth, panelRight);
    // Wrap into the primary world copy around the visible center.
    const world = 512 * 2 ** zoom;
    let screenX = x;
    const visibleCenter = panelRight + visible / 2;
    while (screenX < visibleCenter - world / 2) screenX += world;
    while (screenX > visibleCenter + world / 2) screenX -= world;
    assert.ok(
      screenX > panelRight,
      `${name} at x=${screenX.toFixed(1)} must sit right of the list (x>${panelRight}) on ${canvasWidth}`
    );
    assert.ok(
      screenX < canvasWidth,
      `${name} at x=${screenX.toFixed(1)} must sit left of the canvas edge on ${canvasWidth}`
    );
  }
}

test('list panel right edge matches the floating list (16 + 380)', () => {
  assert.equal(LIST_PANEL_RIGHT, 396);
  assert.equal(listPanelRightEdge(1440), 396);
  assert.equal(listPanelRightEdge(1280), 396);
});

test('Worldwide framing keeps US, Hawaii, and Fiji in the visible gap on 1440 and 1280', () => {
  assertWorldwideFraming(1440);
  assertWorldwideFraming(1280);
});
