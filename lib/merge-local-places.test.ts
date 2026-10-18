import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeCardKey, reconcilePlacesById, retainPlaceNodes, reuseIfSamePlaceRefs } from './merge-local-places';
import type { PlaceSearchResult } from './types';

function place(id: string): PlaceSearchResult {
  return {
    place_id: id,
    place_slug: id,
    place_name: id,
    place_type: 'business',
    address: null,
    city: null,
    state_province: null,
    country: null,
    activity_types: ['sauna'],
    description: null,
    cover_image: null,
    lat: 0,
    lng: 0,
    is_approved: true,
    ts_created: '2024-01-01T00:00:00Z',
  };
}

test('reuseIfSamePlaceRefs keeps the previous array when item refs match', () => {
  const a = place('a');
  const b = place('b');
  const prev = [a, b];
  const next = [a, b];
  assert.equal(reuseIfSamePlaceRefs(prev, next), prev);
  assert.equal(reuseIfSamePlaceRefs(null, next), next);
  const other = [place('a'), b];
  assert.equal(reuseIfSamePlaceRefs(prev, other), other);
  const empty: PlaceSearchResult[] = [];
  assert.equal(reuseIfSamePlaceRefs(empty, []), empty);
});

test('same place id keeps its DOM node across a results update', () => {
  const a = place('a');
  const b = place('b');
  const prev = [a, b];
  const incoming = [{ ...a, place_name: 'A renamed' }, place('c'), { ...b, city: 'Tempe' }];
  const out = reconcilePlacesById(prev, incoming);
  assert.equal(out[0], a);
  assert.equal(out[2], b);
  assert.equal(out[1].place_id, 'c');
  assert.equal(placeCardKey(out[0]), 'a');

  const nodeA = { el: 'dom-a' };
  const nodeB = { el: 'dom-b' };
  const prevNodes = new Map([
    ['a', nodeA],
    ['b', nodeB],
  ]);
  const nextNodes = retainPlaceNodes(prevNodes, ['c', 'a', 'b'], (id) => ({ el: `dom-${id}` }));
  assert.equal(nextNodes.get('a'), nodeA);
  assert.equal(nextNodes.get('b'), nodeB);
  assert.equal(nextNodes.get('c')?.el, 'dom-c');
  assert.notEqual(nextNodes.get('c'), nodeA);
});
