import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listLocationName } from './list-location-name';
import { LOCATION_PRESETS } from './locations';
import type { PlaceSearchResult } from './types';

const worldwide = LOCATION_PRESETS.find((item) => item.id === 'worldwide')!;
const unitedStates = LOCATION_PRESETS.find((item) => item.id === 'united-states')!;
const saltLake = LOCATION_PRESETS.find((item) => item.id === 'salt-lake-city')!;
const helsinki = LOCATION_PRESETS.find((item) => item.id === 'helsinki')!;

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

test('mixed city-scale results do not pick a weak plurality or a stale chip city', () => {
  const places = placesIn('Scottsdale', 5, [{ city: 'Phoenix', count: 4 }]);
  assert.equal(listLocationName({ hasMap: true, zoom: 11, places, location: helsinki }), 'this area');
  assert.equal(listLocationName({ hasMap: true, zoom: 11, places, location: saltLake }), 'this area');
});

test('majority concentration can name a city below city-scale zoom', () => {
  const places = placesIn('Scottsdale', 9, [{ city: 'Phoenix', count: 1 }]);
  assert.equal(listLocationName({ hasMap: true, zoom: 6, places, location: unitedStates }), 'Scottsdale');
});

test('worldwide chip at regional zoom falls back to this area', () => {
  const places = placesIn('Scottsdale', 5, [
    { city: 'Helsinki', count: 4 },
    { city: 'London', count: 3 },
  ]);
  assert.equal(listLocationName({ hasMap: true, zoom: 4, places, location: worldwide }), 'this area');
});

test('no map uses the selected chip', () => {
  assert.equal(listLocationName({ hasMap: false, zoom: null, places: [], location: worldwide }), 'the world');
  assert.equal(listLocationName({ hasMap: false, zoom: null, places: [], location: unitedStates }), 'United States');
});
