import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listLocationName, locationChipLabel } from './list-location-name';
import { LOCATION_PRESETS } from './locations';
import type { PlaceSearchResult } from './types';

const worldwide = LOCATION_PRESETS.find((item) => item.id === 'worldwide')!;
const unitedStates = LOCATION_PRESETS.find((item) => item.id === 'united-states')!;
const saltLake = LOCATION_PRESETS.find((item) => item.id === 'salt-lake-city')!;

function placesIn(city: string, count: number, extras: Array<{ city: string; count: number }> = []): Pick<PlaceSearchResult, 'city'>[] {
  const rows: Pick<PlaceSearchResult, 'city'>[] = [];
  for (let i = 0; i < count; i += 1) rows.push({ city });
  for (const extra of extras) {
    for (let i = 0; i < extra.count; i += 1) rows.push({ city: extra.city });
  }
  return rows;
}

test('world zoom never names the most common city', () => {
  const places = placesIn('Scottsdale', 10, [
    { city: 'Reykjavík', count: 4 },
    { city: 'Helsinki', count: 3 },
    { city: 'Tokyo', count: 2 },
  ]);
  assert.equal(listLocationName({ hasMap: true, zoom: 1, places, location: worldwide }), 'the world');
  assert.equal(listLocationName({ hasMap: true, zoom: 1.6, places, location: worldwide }), 'the world');
});

test('US-scale zoom uses the chip label instead of a plurality city', () => {
  const places = placesIn('Scottsdale', 8, [
    { city: 'Salt Lake City', count: 4 },
    { city: 'New York', count: 3 },
  ]);
  assert.equal(listLocationName({ hasMap: true, zoom: 3.4, places, location: unitedStates }), 'United States');
});

test('city-scale zoom names the city when results are concentrated there', () => {
  const places = placesIn('Salt Lake City', 6, [{ city: 'Brighton', count: 1 }]);
  assert.equal(listLocationName({ hasMap: true, zoom: 11, places, location: saltLake }), 'Salt Lake City');
});

test('on a preset the chip name wins over a mismatched or single API city', () => {
  const brooklyn = placesIn('Brooklyn', 1);
  const newYork = LOCATION_PRESETS.find((item) => item.id === 'new-york')!;
  assert.equal(
    listLocationName({ hasMap: true, zoom: 11, places: brooklyn, location: newYork }),
    'New York'
  );
  assert.equal(
    listLocationName({ hasMap: true, zoom: 11, places: brooklyn, location: newYork, leftPreset: true }),
    'this area'
  );
});

test('majority results on a country preset still use the preset name', () => {
  const places = placesIn('Scottsdale', 9, [{ city: 'Phoenix', count: 1 }]);
  assert.equal(listLocationName({ hasMap: true, zoom: 6, places, location: unitedStates }), 'United States');
});

test('worldwide stays worldwide until the camera leaves the preset', () => {
  const places = placesIn('Scottsdale', 5, [
    { city: 'Helsinki', count: 4 },
    { city: 'London', count: 3 },
  ]);
  assert.equal(listLocationName({ hasMap: true, zoom: 4, places, location: worldwide }), 'the world');
  assert.equal(
    listLocationName({ hasMap: true, zoom: 1, places, location: worldwide, leftPreset: true }),
    'this area'
  );
});

test('no map uses the selected chip', () => {
  assert.equal(listLocationName({ hasMap: false, zoom: null, places: [], location: worldwide }), 'the world');
  assert.equal(listLocationName({ hasMap: false, zoom: null, places: [], location: unitedStates }), 'United States');
});

test('user-initiated pan away from a country preset uses this area, not the chip', () => {
  const places = placesIn('Suva', 2, [{ city: 'Nadi', count: 1 }]);
  assert.equal(
    listLocationName({
      hasMap: true,
      zoom: 3.4,
      places,
      location: unitedStates,
      leftPreset: false,
    }),
    'United States'
  );
  assert.equal(
    listLocationName({
      hasMap: true,
      zoom: 3.4,
      places,
      location: unitedStates,
      leftPreset: true,
    }),
    'this area'
  );
});

test('location chip switches to Map area after a user leaves the preset', () => {
  assert.equal(locationChipLabel(unitedStates, false), 'United States');
  assert.equal(locationChipLabel(unitedStates, true), 'Map area');
  assert.equal(locationChipLabel(worldwide, true), 'Map area');
});
