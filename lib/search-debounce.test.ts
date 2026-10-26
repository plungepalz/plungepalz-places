import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SEARCH_DEBOUNCE_MS,
  createDebounced,
  searchAfterViewportChange,
  searchDebounceMs,
  viewportSearchIdentity,
} from './search-debounce';

test('moveend search waits longer than filter search', () => {
  assert.equal(SEARCH_DEBOUNCE_MS.filters, 200);
  assert.equal(SEARCH_DEBOUNCE_MS.moveend, 450);
  assert.equal(searchDebounceMs('moveend'), 450);
  assert.equal(searchDebounceMs('filters'), 200);
  assert.equal(searchDebounceMs('skip'), 0);
});

test('preset chip search ignores bbox churn so the header can settle with the flight', () => {
  assert.equal(viewportSearchIdentity(false, 'tokyo-bounds'), 'preset-chip');
  assert.equal(viewportSearchIdentity(false, 'worldwide-bounds'), 'preset-chip');
  assert.equal(viewportSearchIdentity(false, 'x', 'tokyo'), 'preset:tokyo');
  assert.equal(viewportSearchIdentity(false, 'y', 'worldwide'), 'preset:worldwide');
  assert.notEqual(
    viewportSearchIdentity(false, 'x', 'tokyo'),
    viewportSearchIdentity(false, 'x', 'worldwide')
  );
  assert.equal(viewportSearchIdentity(true, 'a'), 'a');
  assert.notEqual(viewportSearchIdentity(true, 'a'), viewportSearchIdentity(true, 'b'));
});

test('user map moves debounce on moveend; preset chips search without bbox', () => {
  assert.deepEqual(
    searchAfterViewportChange({ leftPreset: false, boundsKey: 'a', lastPresetKey: '' }),
    { action: 'filters', nextPresetKey: 'preset-chip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: '',
      settleKey: 'preset:tokyo',
    }),
    { action: 'filters', nextPresetKey: 'preset:tokyo' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: 'preset:tokyo',
      settleKey: 'preset:tokyo',
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({ leftPreset: true, boundsKey: '', lastPresetKey: 'a' }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({ leftPreset: true, boundsKey: 'a', lastPresetKey: 'a' }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({ leftPreset: true, boundsKey: 'b', lastPresetKey: 'a' }),
    { action: 'moveend' }
  );
});

test('cluster expand is a programmatic camera and keeps the header old→final', () => {
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'cluster-mid',
      lastPresetKey: 'us',
      cameraBusy: true,
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'cluster-final',
      lastPresetKey: 'us',
      cameraBusy: false,
    }),
    { action: 'moveend' }
  );
});

test('programmatic camera suppresses moveend search so the header stays old→final', () => {
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'tempe',
      lastPresetKey: 'us',
      cameraBusy: true,
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: 'tokyo',
      lastPresetKey: 'us',
      cameraBusy: true,
      settleKey: 'preset:tokyo',
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: 'preset:us',
      cameraBusy: false,
      settleKey: 'preset:tokyo',
    }),
    { action: 'filters', nextPresetKey: 'preset:tokyo' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'tempe',
      lastPresetKey: 'us',
      cameraBusy: false,
    }),
    { action: 'moveend' }
  );
});

test('one /search per settle: busy, resize, and a repeat chip are skipped', () => {
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: '',
      cameraBusy: true,
      settleKey: 'preset:worldwide',
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: 'resized',
      lastPresetKey: 'preset:worldwide',
      cameraBusy: false,
      settleKey: 'preset:worldwide',
    }),
    { action: 'skip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: '',
      cameraBusy: false,
    }),
    { action: 'filters', nextPresetKey: 'preset-chip' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'wheel-zoom-16',
      lastPresetKey: '',
      cameraBusy: false,
    }),
    { action: 'moveend' }
  );
});

test('createDebounced cancels overlapping calls and only invokes the last', async () => {
  const seen: number[] = [];
  const debounced = createDebounced((value: number) => {
    seen.push(value);
  }, 30);
  debounced.call(1);
  debounced.call(2);
  debounced.call(3);
  assert.equal(debounced.pending(), true);
  assert.deepEqual(seen, []);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(seen, [3]);
  assert.equal(debounced.pending(), false);
});

test('createDebounced cancel drops the pending search', async () => {
  const seen: number[] = [];
  const debounced = createDebounced((value: number) => {
    seen.push(value);
  }, 20);
  debounced.call(1);
  debounced.cancel();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(seen, []);
});
