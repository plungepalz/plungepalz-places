import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBbox, wrapLng } from './types';

test('wrapLng maps 180 to -180 and keeps values in (-180, 180]', () => {
  assert.equal(wrapLng(180), -180);
  assert.equal(wrapLng(-180), -180);
  assert.equal(wrapLng(190), -170);
  assert.equal(wrapLng(-190), 170);
});

test('full-width / wrapped worlds send -180..180', () => {
  assert.equal(
    formatBbox({ minLng: -200, minLat: -60, maxLng: 200, maxLat: 70 }),
    '-180,-60,180,70'
  );
  assert.equal(
    formatBbox({ minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 }),
    '-180,-85,180,85'
  );
});

test('antimeridian-crossing bbox is sent as minLng > maxLng', () => {
  assert.equal(
    formatBbox({ minLng: 170, minLat: 10, maxLng: 190, maxLat: 40 }),
    '170,10,-170,40'
  );
});

test('non-crossing boxes wrap but stay minLng <= maxLng', () => {
  assert.equal(
    formatBbox({ minLng: -110, minLat: 25, maxLng: -70, maxLat: 50 }),
    '-110,25,-70,50'
  );
});
