import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placesListHeading } from './list-heading';

test('has_more uses Showing X of Y and keeps location wording', () => {
  assert.equal(
    placesListHeading(500, 1842, 'United States', { hasMore: true }),
    'Showing 500 of 1842 places in United States'
  );
  assert.equal(
    placesListHeading(500, 1842, 'the world', { hasMore: true }),
    'Showing 500 of 1842 places worldwide'
  );
});

test('capped results (limit or 1000-hit cap) use Showing X of Y even when has_more is false', () => {
  assert.equal(
    placesListHeading(1000, 2500, 'this area', { hasMore: false }),
    'Showing 1000 of 2500 places in this area'
  );
  assert.equal(
    placesListHeading(500, 1200, 'the world', { hasMore: false }),
    'Showing 500 of 1200 places worldwide'
  );
});

test('complete catalog uses the API total, not a shown-count fallback', () => {
  assert.equal(placesListHeading(29, 29, 'Salt Lake City'), '29 places in Salt Lake City');
  assert.equal(placesListHeading(1, 1, 'Helsinki'), '1 place in Helsinki');
});
