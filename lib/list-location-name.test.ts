import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listLocationName, locationChipLabel } from './list-location-name';
import { LOCATION_PRESETS } from './locations';

const worldwide = LOCATION_PRESETS.find((item) => item.id === 'worldwide')!;
const unitedStates = LOCATION_PRESETS.find((item) => item.id === 'united-states')!;
const saltLake = LOCATION_PRESETS.find((item) => item.id === 'salt-lake-city')!;

test('world zoom never names the most common city', () => {
  assert.equal(listLocationName({ location: worldwide }), 'the world');
});

test('US-scale zoom uses the chip label instead of a plurality city', () => {
  assert.equal(listLocationName({ location: unitedStates }), 'United States');
});

test('city-scale zoom names the city when results are concentrated there', () => {
  assert.equal(listLocationName({ location: saltLake }), 'Salt Lake City');
});

test('on a preset the chip name wins over a mismatched or single API city', () => {
  const newYork = LOCATION_PRESETS.find((item) => item.id === 'new-york')!;
  assert.equal(listLocationName({ location: newYork }), 'New York');
  assert.equal(listLocationName({ location: newYork, leftPreset: true }), 'this area');
});

test('majority results on a country preset still use the preset name', () => {
  assert.equal(listLocationName({ location: unitedStates }), 'United States');
});

test('worldwide stays worldwide until the camera leaves the preset', () => {
  assert.equal(listLocationName({ location: worldwide }), 'the world');
  assert.equal(listLocationName({ location: worldwide, leftPreset: true }), 'this area');
});

test('no map uses the selected chip', () => {
  assert.equal(listLocationName({ location: worldwide }), 'the world');
  assert.equal(listLocationName({ location: unitedStates }), 'United States');
});

test('user-initiated pan away from a country preset uses this area, not the chip', () => {
  assert.equal(listLocationName({ location: unitedStates, leftPreset: false }), 'United States');
  assert.equal(listLocationName({ location: unitedStates, leftPreset: true }), 'this area');
});

test('location chip switches to Map area after a user leaves the preset', () => {
  assert.equal(locationChipLabel(unitedStates, false), 'United States');
  assert.equal(locationChipLabel(unitedStates, true), 'Map area');
  assert.equal(locationChipLabel(worldwide, true), 'Map area');
});
