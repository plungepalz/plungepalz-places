import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRAND } from './brand';
import {
  CLUSTER_COLOR_EXPRESSION,
  CLUSTER_COUNT_LARGE,
  CLUSTER_COUNT_SMALL,
  CLUSTER_RADIUS,
  CLUSTER_RADIUS_EXPRESSION,
  PIN_HALO_RADIUS,
  PIN_HALO_RADIUS_EXPRESSION,
  PIN_ICON_SIZE,
  PIN_ICON_SIZE_EXPRESSION,
  PIN_IMAGE_EXPRESSION,
  clusterColorForCount,
  clusterLeafHasPlace,
  clusterRadiusForCount,
  pinHaloRadius,
  pinIconSize,
  pinImageForState,
  pinVisualState,
  shouldScrollChildIntoView,
  stepByPointCount,
} from './map-style';

test('brand orange token is a single hex used by pins and accents', () => {
  assert.equal(BRAND.orange, '#f97316');
  assert.equal(BRAND.orangeSelected, '#ea580c');
  assert.equal(BRAND.clusterMedium, BRAND.orange);
});

test('cluster radius and color step at <10, <50, 50+', () => {
  assert.equal(clusterRadiusForCount(1), CLUSTER_RADIUS.small);
  assert.equal(clusterRadiusForCount(9), CLUSTER_RADIUS.small);
  assert.equal(clusterRadiusForCount(10), CLUSTER_RADIUS.medium);
  assert.equal(clusterRadiusForCount(49), CLUSTER_RADIUS.medium);
  assert.equal(clusterRadiusForCount(50), CLUSTER_RADIUS.large);
  assert.equal(clusterRadiusForCount(200), CLUSTER_RADIUS.large);

  assert.equal(clusterColorForCount(3), BRAND.clusterSmall);
  assert.equal(clusterColorForCount(10), BRAND.clusterMedium);
  assert.equal(clusterColorForCount(50), BRAND.clusterLarge);
});

test('cluster step expressions match the count helpers', () => {
  assert.deepEqual(
    CLUSTER_RADIUS_EXPRESSION,
    stepByPointCount(CLUSTER_RADIUS.small, CLUSTER_RADIUS.medium, CLUSTER_RADIUS.large)
  );
  assert.deepEqual(CLUSTER_RADIUS_EXPRESSION[3], CLUSTER_COUNT_SMALL);
  assert.deepEqual(CLUSTER_RADIUS_EXPRESSION[5], CLUSTER_COUNT_LARGE);
  assert.deepEqual(CLUSTER_COLOR_EXPRESSION, [
    'step',
    ['get', 'point_count'],
    BRAND.clusterSmall,
    10,
    BRAND.clusterMedium,
    50,
    BRAND.clusterLarge,
  ]);
});

test('pin visual state prefers selected over hover', () => {
  assert.equal(pinVisualState('a', 'a', 'b'), 'hover');
  assert.equal(pinVisualState('b', 'a', 'b'), 'selected');
  assert.equal(pinVisualState('b', 'b', 'b'), 'selected');
  assert.equal(pinVisualState('c', 'a', 'b'), 'default');
});

test('pin icon, halo, and image follow the visual state', () => {
  assert.equal(pinIconSize('default'), PIN_ICON_SIZE.default);
  assert.equal(pinIconSize('hover'), PIN_ICON_SIZE.hover);
  assert.equal(pinIconSize('selected'), PIN_ICON_SIZE.selected);
  assert.ok(PIN_ICON_SIZE.hover > PIN_ICON_SIZE.default);
  assert.ok(PIN_ICON_SIZE.selected > PIN_ICON_SIZE.hover);
  assert.equal(pinHaloRadius('default'), 0);
  assert.equal(pinHaloRadius('selected'), PIN_HALO_RADIUS.selected);
  assert.equal(pinImageForState('selected'), 'pin-place-active');
  assert.equal(pinImageForState('hover'), 'pin-place');
  assert.equal(PIN_IMAGE_EXPRESSION[2], 'pin-place-active');
  assert.deepEqual(PIN_ICON_SIZE_EXPRESSION[2], PIN_ICON_SIZE.selected);
  assert.deepEqual(PIN_HALO_RADIUS_EXPRESSION[4], PIN_HALO_RADIUS.hover);
});

test('cluster leaf lookup is a cheap place_id scan', () => {
  const leaves = [
    { properties: { place_id: 'aaa' } },
    { place_id: 'bbb' },
  ];
  assert.equal(clusterLeafHasPlace(leaves, 'aaa'), true);
  assert.equal(clusterLeafHasPlace(leaves, 'bbb'), true);
  assert.equal(clusterLeafHasPlace(leaves, 'ccc'), false);
  assert.equal(clusterLeafHasPlace(leaves, null), false);
});

test('list scroll only when the card is off-screen', () => {
  const parent = { top: 100, bottom: 500 };
  assert.equal(shouldScrollChildIntoView({ top: 120, bottom: 200 }, parent), false);
  assert.equal(shouldScrollChildIntoView({ top: 80, bottom: 160 }, parent), true);
  assert.equal(shouldScrollChildIntoView({ top: 480, bottom: 560 }, parent), true);
});
