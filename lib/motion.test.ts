import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAWER_MOTION_MS, motionDurationMs, presencePhase } from './motion';

test('presence stays mounted while closing so the drawer can animate out', () => {
  assert.equal(presencePhase(true, false), 'open');
  assert.equal(presencePhase(true, true), 'open');
  assert.equal(presencePhase(false, true), 'closing');
  assert.equal(presencePhase(false, false), 'closed');
});

test('reduced motion collapses animation duration', () => {
  assert.equal(motionDurationMs(false, DRAWER_MOTION_MS), DRAWER_MOTION_MS);
  assert.equal(motionDurationMs(true, DRAWER_MOTION_MS), 0);
});
