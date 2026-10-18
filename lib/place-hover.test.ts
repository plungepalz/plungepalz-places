import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlaceHoverController } from './place-hover';

function manualRaf() {
  let id = 1;
  const pending = new Map<number, () => void>();
  return {
    schedule(cb: () => void) {
      const next = id++;
      pending.set(next, cb);
      return next;
    },
    cancel(handle: number) {
      pending.delete(handle);
    },
    flush() {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb();
    },
    size() {
      return pending.size;
    },
  };
}

test('card hover coalesces to one feature-state write and never scrolls', () => {
  const raf = manualRaf();
  const hover = createPlaceHoverController();
  hover.installScheduler(raf.schedule, raf.cancel);
  const features: Array<string | null> = [];
  const highlights: Array<string | null> = [];
  const scrolls: string[] = [];
  hover.bindFeatureState((id) => features.push(id));
  hover.bindCardHighlight((id) => highlights.push(id));
  hover.bindPinScroll((id) => scrolls.push(id));
  hover.setHover('a', 'card');
  hover.setHover('b', 'card');
  hover.setHover('c', 'card');
  assert.equal(raf.size(), 1);
  assert.deepEqual(features, []);
  raf.flush();
  assert.deepEqual(features, ['c']);
  assert.deepEqual(highlights, ['c']);
  assert.deepEqual(scrolls, []);
  hover.setHover('c', 'card');
  raf.flush();
  assert.deepEqual(features, ['c']);
  hover.dispose();
});

test('pin hover of a new id setFeatureStates once then asks the list to scroll', () => {
  const raf = manualRaf();
  const hover = createPlaceHoverController();
  hover.installScheduler(raf.schedule, raf.cancel);
  const features: Array<string | null> = [];
  const scrolls: string[] = [];
  hover.bindFeatureState((id) => features.push(id));
  hover.bindPinScroll((id) => scrolls.push(id));
  hover.setHover('tempe', 'pin');
  raf.flush();
  assert.deepEqual(features, ['tempe']);
  assert.deepEqual(scrolls, ['tempe']);
  hover.setHover('tempe', 'pin');
  raf.flush();
  assert.deepEqual(features, ['tempe']);
  assert.deepEqual(scrolls, ['tempe', 'tempe']);
  hover.dispose();
});
