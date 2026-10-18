import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRAND } from './brand';
import {
  CLUSTER_COLOR_EXPRESSION,
  CLUSTER_COUNT_LARGE,
  CLUSTER_COUNT_SMALL,
  CLUSTER_RADIUS,
  CLUSTER_RADIUS_EXPRESSION,
  MAPBOX_STREETS_STYLE,
  MAP_FADE_DURATION_MS,
  PAINT_TRANSITION,
  PIN_HALO_RADIUS,
  PIN_HALO_RADIUS_EXPRESSION,
  PIN_ICON_SIZE,
  PIN_STROKE,
  PLACES_LAYERS_ABOVE_LABELS,
  PLACES_LAYERS_BEFORE_ID,
  WCAG_AA_NORMAL,
  clusterColorForCount,
  clusterLabelPairs,
  clusterLeafHasPlace,
  clusterRadiusForCount,
  clusterTextColorForCount,
  contrastRatio,
  expressionContainsFeatureState,
  pinHaloRadius,
  pinIconSize,
  pinImageForState,
  pinVisualState,
  placeIdInFilter,
  placesMapLayerSpecs,
  placesSourceSignature,
  placesToGeoJSON,
  shouldScrollChildIntoView,
  stepByPointCount,
} from './map-style';

test('brand orange token is a single hex used by pins and accents', () => {
  assert.equal(BRAND.orange, '#f97316');
  assert.equal(BRAND.orangeSelected, '#ea580c');
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

test('cluster count labels meet WCAG AA against their fills', () => {
  for (const { count, fill, text } of clusterLabelPairs()) {
    const ratio = contrastRatio(fill, text);
    assert.ok(
      ratio >= WCAG_AA_NORMAL,
      `count ${count}: ${text} on ${fill} contrast ${ratio.toFixed(2)} < ${WCAG_AA_NORMAL}`
    );
  }
  assert.equal(clusterTextColorForCount(3), BRAND.clusterTextOnSmall);
  assert.equal(clusterTextColorForCount(10), BRAND.clusterText);
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
  assert.ok(expressionContainsFeatureState(PIN_HALO_RADIUS_EXPRESSION));
});

test('map uses streets-v12 and paints Places layers above labels', () => {
  assert.equal(MAPBOX_STREETS_STYLE, 'mapbox://styles/mapbox/streets-v12');
  assert.equal(PLACES_LAYERS_ABOVE_LABELS, true);
  assert.equal(PLACES_LAYERS_BEFORE_ID, undefined);
  assert.ok(MAP_FADE_DURATION_MS >= 300);
  assert.equal(PAINT_TRANSITION.duration, 180);
  assert.equal(PIN_STROKE, '#ffffff');
  assert.equal(BRAND.clusterStroke, '#ffffff');
});

test('no layer layout property uses feature-state (Mapbox paint-only)', () => {
  assert.equal(
    expressionContainsFeatureState({
      'icon-size': ['case', ['boolean', ['feature-state', 'hover'], false], 1.2, 1],
    }),
    true
  );

  const layers = placesMapLayerSpecs({
    hoveredPlaceId: 'hover-id',
    selectedPlaceId: 'selected-id',
    highlightedClusterId: 9,
  });
  assert.ok(layers.some((layer) => layer.id === 'unclustered-point'));
  for (const layer of layers) {
    assert.equal(
      expressionContainsFeatureState(layer.layout ?? {}),
      false,
      `${layer.id} layout must not contain feature-state`
    );
  }
  const base = layers.find((layer) => layer.id === 'unclustered-point')!;
  assert.equal(base.layout?.['icon-image'], 'pin-place');
  assert.equal(base.layout?.['icon-size'], PIN_ICON_SIZE.default);
  const selected = layers.find((layer) => layer.id === 'unclustered-point-selected')!;
  assert.deepEqual(selected.filter, placeIdInFilter(['selected-id']));
  assert.equal(selected.layout?.['icon-image'], 'pin-place-active');
  const halo = layers.find((layer) => layer.id === 'pin-halo')!;
  assert.equal(expressionContainsFeatureState(halo.paint), true);
  assert.equal(halo.paint?.['circle-stroke-color'], PIN_STROKE);

  const hover = layers.find((layer) => layer.id === 'unclustered-point-hover')!;
  assert.equal(expressionContainsFeatureState(hover.layout ?? {}), false);
  assert.equal(expressionContainsFeatureState(hover.paint), true);
  assert.notDeepEqual(hover.filter, placeIdInFilter(['hover-id']));
  assert.equal(hover.paint?.['icon-opacity-transition'], PAINT_TRANSITION);

  const clusters = layers.find((layer) => layer.id === 'clusters')!;
  assert.equal(clusters.paint?.['circle-stroke-color'], BRAND.clusterStroke);
  assert.ok((clusters.paint?.['circle-stroke-width'] as number) >= 2);

  assert.ok(layers.some((layer) => layer.id === 'cluster-shadow'));
  assert.ok(layers.some((layer) => layer.id === 'pin-shadow'));
});

test('hover does not remount pin filters; selected still uses a dedicated layer', () => {
  const idle = placesMapLayerSpecs({ selectedPlaceId: null });
  const hovered = placesMapLayerSpecs({ hoveredPlaceId: 'hover-id', selectedPlaceId: null });
  const idleHover = idle.find((layer) => layer.id === 'unclustered-point-hover')!;
  const nextHover = hovered.find((layer) => layer.id === 'unclustered-point-hover')!;
  assert.deepEqual(idleHover.filter, nextHover.filter);
  assert.deepEqual(idle.find((layer) => layer.id === 'unclustered-point')?.filter, [
    '!',
    ['has', 'point_count'],
  ]);
});

test('places GeoJSON signature stays put when only names are unused', () => {
  const places = [
    { place_id: 'a', place_name: 'One', lat: 1, lng: 2 },
    { place_id: 'b', place_name: 'Two', lat: 3, lng: 4 },
  ];
  assert.equal(placesSourceSignature(places), placesSourceSignature(places.map((p) => ({ ...p }))));
  const geo = placesToGeoJSON(places);
  assert.equal(geo.features.length, 2);
  assert.deepEqual(geo.features[0].geometry.coordinates, [2, 1]);
  assert.equal(geo.features[0].id, 'a');
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
