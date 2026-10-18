import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createListHeadingMachine,
  headingZoomForSearch,
  listHeadingText,
  settleListHeadingRequest,
  shouldApplySettledSearch,
  startListHeadingRequest,
} from './list-heading-state';
import { LOCATION_PRESETS } from './locations';
import type { PlaceSearchResult } from './types';

const worldwide = LOCATION_PRESETS.find((item) => item.id === 'worldwide')!;
const unitedStates = LOCATION_PRESETS.find((item) => item.id === 'united-states')!;
const saltLake = LOCATION_PRESETS.find((item) => item.id === 'salt-lake-city')!;

function placesIn(
  city: string,
  count: number,
  extras: Array<{ city: string; count: number }> = []
): Pick<PlaceSearchResult, 'city'>[] {
  const rows: Pick<PlaceSearchResult, 'city'>[] = Array.from({ length: count }, () => ({ city }));
  for (const extra of extras) {
    for (let i = 0; i < extra.count; i += 1) rows.push({ city: extra.city });
  }
  return rows;
}

/** Mixed country-scale results — no city reaches the majority threshold. */
function usScalePlaces(): Pick<PlaceSearchResult, 'city'>[] {
  return placesIn('Scottsdale', 20, [
    { city: 'Salt Lake City', count: 15 },
    { city: 'New York', count: 12 },
    { city: 'Austin', count: 12 },
  ]);
}

test('preset reset keeps the previous heading until the matching response settles', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 7, total: 7, hasMore: false, places: placesIn('Salt Lake City', 7) },
    { hasMap: true, zoom: saltLake.zoom, location: saltLake, leftPreset: false }
  );
  assert.equal(listHeadingText(state.heading), '7 places in Salt Lake City');
  assert.equal(state.heading?.chipLabel, 'Salt Lake City');

  state = startListHeadingRequest(state);
  assert.equal(state.pending, true);
  assert.equal(listHeadingText(state.heading), '7 places in Salt Lake City');
  assert.equal(state.heading?.chipLabel, 'Salt Lake City');

  state = settleListHeadingRequest(
    state,
    2,
    { shown: 59, total: 59, hasMore: false, places: usScalePlaces() },
    { hasMap: true, zoom: unitedStates.zoom, location: unitedStates, leftPreset: false }
  );
  assert.equal(state.pending, false);
  assert.equal(listHeadingText(state.heading), '59 places in United States');
  assert.equal(state.heading?.chipLabel, 'United States');
});

test('never pairs a new preset label with a stale count', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 7, total: 7, hasMore: false, places: placesIn('Salt Lake City', 7) },
    { hasMap: true, zoom: saltLake.zoom, location: saltLake, leftPreset: false }
  );

  state = startListHeadingRequest(state);
  const pendingText = listHeadingText(state.heading);
  assert.ok(pendingText);
  assert.equal(pendingText.includes('United States'), false);
  assert.equal(pendingText, '7 places in Salt Lake City');
});

test('newest-first then older-second does not apply the stale list', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state); // worldwide, id 1
  state = startListHeadingRequest(state); // US, id 2

  state = settleListHeadingRequest(
    state,
    2,
    { shown: 59, total: 59, hasMore: false, places: usScalePlaces() },
    { hasMap: true, zoom: unitedStates.zoom, location: unitedStates, leftPreset: false }
  );
  assert.equal(state.pending, false);
  assert.equal(shouldApplySettledSearch(2, state), true);
  assert.equal(listHeadingText(state.heading), '59 places in United States');

  const afterStale = settleListHeadingRequest(
    state,
    1,
    { shown: 82, total: 82, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: worldwide.zoom, location: worldwide, leftPreset: false }
  );
  // The old `if (settled.pending) return` guard lets this through: newest
  // already settled, so pending is still false. The page must gate on id.
  assert.equal(afterStale.pending, false);
  assert.equal(shouldApplySettledSearch(1, afterStale), false);
  assert.equal(listHeadingText(afterStale.heading), '59 places in United States');
  assert.equal(afterStale.heading?.shown, 59);
  assert.equal(afterStale.heading?.chipLabel, 'United States');
});

test('out-of-order responses are ignored; the latest request wins', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 7, total: 7, hasMore: false, places: placesIn('Salt Lake City', 7) },
    { hasMap: true, zoom: saltLake.zoom, location: saltLake, leftPreset: false }
  );

  state = startListHeadingRequest(state); // US, id 2
  state = startListHeadingRequest(state); // Tempe fly-to, id 3

  const afterStale = settleListHeadingRequest(
    state,
    2,
    { shown: 59, total: 59, hasMore: false, places: usScalePlaces() },
    { hasMap: true, zoom: unitedStates.zoom, location: unitedStates, leftPreset: false }
  );
  assert.equal(afterStale, state);
  assert.equal(afterStale.pending, true);
  assert.equal(listHeadingText(afterStale.heading), '7 places in Salt Lake City');
  assert.equal(afterStale.heading?.chipLabel, 'Salt Lake City');

  state = settleListHeadingRequest(
    afterStale,
    3,
    { shown: 1, total: 1, hasMore: false, places: placesIn('Tempe', 1) },
    { hasMap: true, zoom: 12, location: unitedStates, leftPreset: true }
  );
  assert.equal(state.pending, false);
  assert.equal(listHeadingText(state.heading), '1 place in this area');
  assert.equal(state.heading?.chipLabel, 'Map area');
});

test('a later request id aborts an in-flight settle (AbortController / request-id guard)', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  const abortedId = state.requestId;
  state = startListHeadingRequest(state);

  state = settleListHeadingRequest(
    state,
    abortedId,
    { shown: 70, total: 70, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: 1, location: worldwide, leftPreset: false }
  );
  assert.equal(state.heading, null);
  assert.equal(state.pending, true);

  state = settleListHeadingRequest(
    state,
    state.requestId,
    { shown: 82, total: 82, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: worldwide.zoom, location: worldwide, leftPreset: false }
  );
  assert.equal(listHeadingText(state.heading), '82 places worldwide');
  assert.equal(state.heading?.chipLabel, 'Worldwide');
});

test('leaving the preset settles as Map area, not the old chip name', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 59, total: 59, hasMore: false, places: usScalePlaces() },
    { hasMap: true, zoom: unitedStates.zoom, location: unitedStates, leftPreset: false }
  );
  assert.equal(listHeadingText(state.heading), '59 places in United States');

  state = startListHeadingRequest(state);
  assert.equal(listHeadingText(state.heading), '59 places in United States');

  state = settleListHeadingRequest(
    state,
    2,
    { shown: 1, total: 1, hasMore: false, places: placesIn('Tempe', 1) },
    { hasMap: true, zoom: 12, location: unitedStates, leftPreset: true }
  );
  assert.equal(listHeadingText(state.heading), '1 place in this area');
  assert.equal(state.heading?.chipLabel, 'Map area');
});

test('worldwide catalog uses the API total once the matching response settles', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 70, total: 70, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: 0.814, location: worldwide, leftPreset: false }
  );
  state = startListHeadingRequest(state);
  assert.equal(listHeadingText(state.heading), '70 places worldwide');

  state = settleListHeadingRequest(
    state,
    2,
    { shown: 82, total: 82, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: worldwide.zoom, location: worldwide, leftPreset: false }
  );
  assert.equal(listHeadingText(state.heading), '82 places worldwide');
});

test('headingZoomForSearch uses the preset zoom until the camera leaves it', () => {
  assert.equal(headingZoomForSearch(false, 12, unitedStates), unitedStates.zoom);
  assert.equal(headingZoomForSearch(true, 12, unitedStates), 12);
});

test('Map area after a Worldwide cluster expand is never "worldwide"', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 82, total: 82, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: worldwide.zoom, location: worldwide, leftPreset: false }
  );
  assert.equal(listHeadingText(state.heading), '82 places worldwide');

  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    2,
    { shown: 76, total: 76, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: 1, location: worldwide, leftPreset: true }
  );
  assert.equal(listHeadingText(state.heading), '76 places in this area');
  assert.equal(state.heading?.chipLabel, 'Map area');
  assert.equal(state.heading?.locationName.includes('world'), false);
});

test('Map area after a Worldwide mouse drag is never "worldwide"', () => {
  let state = createListHeadingMachine();
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    1,
    { shown: 82, total: 82, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: 0.585, location: worldwide, leftPreset: false }
  );
  state = startListHeadingRequest(state);
  state = settleListHeadingRequest(
    state,
    2,
    { shown: 77, total: 77, hasMore: false, places: placesIn('Scottsdale', 10) },
    { hasMap: true, zoom: 0.814, location: worldwide, leftPreset: true }
  );
  assert.equal(listHeadingText(state.heading), '77 places in this area');
  assert.equal(state.heading?.chipLabel, 'Map area');
});

test('every preset names itself, including a one-place New York with city Brooklyn', () => {
  for (const preset of LOCATION_PRESETS) {
    let state = createListHeadingMachine();
    state = startListHeadingRequest(state);
    state = settleListHeadingRequest(
      state,
      1,
      { shown: 1, total: 1, hasMore: false, places: placesIn('Brooklyn', 1) },
      { hasMap: true, zoom: preset.zoom, location: preset, leftPreset: false }
    );
    const expected =
      preset.id === 'worldwide' ? '1 place worldwide' : `1 place in ${preset.label}`;
    assert.equal(listHeadingText(state.heading), expected, preset.id);
    assert.equal(state.heading?.chipLabel, preset.label, preset.id);
  }
});
