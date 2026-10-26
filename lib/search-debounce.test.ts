import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SEARCH_DEBOUNCE_MS,
  createDebounced,
  rememberSettleKeyOnDispatch,
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
    { action: 'moveend', nextPresetKey: 'b' }
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
    { action: 'moveend', nextPresetKey: 'cluster-final' }
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
    { action: 'moveend', nextPresetKey: 'tempe' }
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
    { action: 'moveend', nextPresetKey: 'wheel-zoom-16' }
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

test('initial load searches once even when the camera never moves', () => {
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: '',
      cameraBusy: false,
      settleKey: 'preset:united-states',
      forceSettle: true,
    }),
    { action: 'filters', nextPresetKey: 'preset:united-states' }
  );
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '',
      lastPresetKey: 'preset:united-states',
      cameraBusy: false,
      settleKey: 'preset:united-states',
    }),
    { action: 'skip' }
  );
});

test('re-clicking a preset after a Map-area excursion searches again', () => {
  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: false,
      boundsKey: '-120,30,-70,50',
      lastPresetKey: '-120,30,-70,50',
      cameraBusy: false,
      settleKey: 'preset:united-states',
    }),
    { action: 'filters', nextPresetKey: 'preset:united-states' }
  );
});

test('a cancelled debounce does not mark the settle key or suppress the idle search', () => {
  const first = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: '',
    lastPresetKey: '',
    cameraBusy: false,
    settleKey: 'preset:united-states',
  });
  assert.equal(first.action, 'filters');
  assert.equal(
    rememberSettleKeyOnDispatch('', first, false),
    '',
    'cancelled timer must not remember the key'
  );

  const busy = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: '',
    lastPresetKey: '',
    cameraBusy: true,
    settleKey: 'preset:united-states',
  });
  assert.equal(busy.action, 'skip');
  assert.equal(rememberSettleKeyOnDispatch('', busy, false), '');

  const idle = searchAfterViewportChange({
    leftPreset: false,
    boundsKey: '',
    lastPresetKey: '',
    cameraBusy: false,
    settleKey: 'preset:united-states',
    forceSettle: true,
  });
  assert.equal(idle.action, 'filters');
  assert.equal(rememberSettleKeyOnDispatch('', idle, true), 'preset:united-states');
});

test('slow-wheel moveends are not swallowed by a cancelled debounce', () => {
  let lastKey = 'preset:united-states';
  const first = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'bbox-1',
    lastPresetKey: lastKey,
    cameraBusy: false,
  });
  assert.deepEqual(first, { action: 'moveend', nextPresetKey: 'bbox-1' });
  lastKey = rememberSettleKeyOnDispatch(lastKey, first, false);
  assert.equal(lastKey, 'preset:united-states');

  const second = searchAfterViewportChange({
    leftPreset: true,
    boundsKey: 'bbox-2',
    lastPresetKey: lastKey,
    cameraBusy: false,
  });
  assert.deepEqual(second, { action: 'moveend', nextPresetKey: 'bbox-2' });
  lastKey = rememberSettleKeyOnDispatch(lastKey, second, true);
  assert.equal(lastKey, 'bbox-2');

  assert.deepEqual(
    searchAfterViewportChange({
      leftPreset: true,
      boundsKey: 'bbox-2',
      lastPresetKey: lastKey,
      cameraBusy: false,
    }),
    { action: 'skip' }
  );
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
