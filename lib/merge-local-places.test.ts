import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listSwapForCls,
  nextPlaceListMountKey,
  placeCardKey,
  placeCardMayAnimateHeight,
  placeListRegionKey,
  PLACE_CARD_LAYOUT,
  placesVisibleDuringFlight,
  reconcilePlacesById,
  retainPlaceNodes,
  reuseIfSamePlaceRefs,
  shouldRemountPlaceList,
} from './merge-local-places';
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

test('placesVisibleDuringFlight keeps previous cards until the camera is idle', () => {
  const us = [place('us-1'), place('us-2')];
  const world = [place('w-1'), place('w-2'), place('w-3')];
  const mid = placesVisibleDuringFlight(world, us, true);
  assert.equal(mid.visible, us);
  assert.equal(mid.hold, us);
  assert.equal(mid.visible.length, 2);
  const settled = placesVisibleDuringFlight(world, mid.hold, false);
  assert.equal(settled.visible, world);
  assert.equal(settled.hold, null);
  const first = placesVisibleDuringFlight(us, null, true);
  assert.equal(first.visible, us);
});

test('placesVisibleDuringFlight holds cards while Worldwide /search is pending', () => {
  const us = [place('us-1'), place('us-2'), place('us-3')];
  const empty: ReturnType<typeof place>[] = [];
  const loading = placesVisibleDuringFlight(empty, us, false, true);
  assert.equal(loading.visible, us);
  assert.equal(loading.visible.length, 3);
  const committed = placesVisibleDuringFlight([place('w-1')], us, false, false);
  assert.equal(committed.visible.length, 1);
  assert.equal(committed.hold, null);
});

test('listSwapForCls takes removed cards out of flow instead of collapsing 98px → 0', () => {
  const us = [place('us-1'), place('us-2'), place('us-3')];
  const world = [place('w-1'), place('w-2')];
  const swap = listSwapForCls(us, world);
  assert.deepEqual(
    swap.exiting.map((item) => item.place_id),
    ['us-1', 'us-2', 'us-3']
  );
  assert.deepEqual(
    swap.incoming.map((item) => item.place_id),
    ['w-1', 'w-2']
  );
  assert.equal(placeCardMayAnimateHeight(), false);
  assert.equal(PLACE_CARD_LAYOUT.minHeightPx, 98);
  assert.ok(
    !(PLACE_CARD_LAYOUT.transitionProperties as readonly string[]).includes('height')
  );
});

function sharedCardShiftPx(
  prev: { place_id: string }[],
  next: { place_id: string }[],
  remount: boolean,
  cardHeight = 98
): number {
  if (remount) return 0;
  const prevIndex = new Map(prev.map((place, index) => [place.place_id, index]));
  let shift = 0;
  next.forEach((place, index) => {
    const from = prevIndex.get(place.place_id);
    if (from != null && index > from) shift = Math.max(shift, (index - from) * cardHeight);
  });
  return shift;
}

test('city to Worldwide remounts the list so shared cards are not pushed down', () => {
  const city = [place('shared'), place('tokyo-2')];
  const world = [place('w-1'), place('shared'), place('w-3')];
  const tokyo = nextPlaceListMountKey({
    prevKey: '0',
    prevRegionKey: '',
    requestId: 1,
    regionKey: placeListRegionKey(false, 'tokyo'),
  });
  const worldwide = nextPlaceListMountKey({
    prevKey: tokyo,
    prevRegionKey: 'preset:tokyo',
    requestId: 2,
    regionKey: placeListRegionKey(false, 'worldwide'),
  });
  assert.equal(shouldRemountPlaceList(tokyo, worldwide), true);
  assert.equal(sharedCardShiftPx(city, world, true), 0);
  assert.ok(sharedCardShiftPx(city, world, false) >= 98);
});

test('Worldwide to city and US to London remount; map-area pans keep the in-place list', () => {
  const world = nextPlaceListMountKey({
    prevKey: '0',
    prevRegionKey: '',
    requestId: 1,
    regionKey: placeListRegionKey(false, 'worldwide'),
  });
  const city = nextPlaceListMountKey({
    prevKey: world,
    prevRegionKey: 'preset:worldwide',
    requestId: 2,
    regionKey: placeListRegionKey(false, 'tokyo'),
  });
  assert.equal(shouldRemountPlaceList(world, city), true);

  const us = nextPlaceListMountKey({
    prevKey: '0',
    prevRegionKey: '',
    requestId: 3,
    regionKey: placeListRegionKey(false, 'united-states'),
  });
  const london = nextPlaceListMountKey({
    prevKey: us,
    prevRegionKey: 'preset:united-states',
    requestId: 4,
    regionKey: placeListRegionKey(false, 'london'),
  });
  assert.equal(shouldRemountPlaceList(us, london), true);

  const mapArea = nextPlaceListMountKey({
    prevKey: us,
    prevRegionKey: 'preset:united-states',
    requestId: 5,
    regionKey: placeListRegionKey(true, 'united-states'),
  });
  assert.equal(shouldRemountPlaceList(us, mapArea), true);
  const pan = nextPlaceListMountKey({
    prevKey: mapArea,
    prevRegionKey: 'map-area',
    requestId: 6,
    regionKey: placeListRegionKey(true, 'united-states'),
  });
  assert.equal(pan, mapArea);
  assert.equal(shouldRemountPlaceList(mapArea, pan), false);
  const loadMore = nextPlaceListMountKey({
    prevKey: mapArea,
    prevRegionKey: 'map-area',
    requestId: 7,
    regionKey: 'map-area',
    append: true,
  });
  assert.equal(loadMore, mapArea);
});
