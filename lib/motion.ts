export const DRAWER_MOTION_MS = 280;
export const LIST_MOTION_MS = 280;
export const CARD_MOTION_MS = 180;

export type PresencePhase = 'open' | 'closing' | 'closed';

/** Pure presence step so drawer open/close can be tested without React. */
export function presencePhase(open: boolean, mounted: boolean): PresencePhase {
  if (open) return 'open';
  if (mounted) return 'closing';
  return 'closed';
}

export function motionDurationMs(prefersReducedMotion: boolean, durationMs: number): number {
  return prefersReducedMotion ? 0 : durationMs;
}
