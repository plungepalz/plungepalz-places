export const SEARCH_DEBOUNCE_MS = {
  /** Filter / query / preset chip — keep the previous heading while this waits. */
  filters: 200,
  /** User map move (moveend → bbox search). */
  moveend: 450,
} as const;

export type SearchTrigger = 'skip' | 'filters' | 'moveend';

/**
 * Chip searches key on the preset (and filters), not the flying bbox, so a
 * resize / padding-clear cannot enqueue a second /search for the same settle.
 */
export function viewportSearchIdentity(
  leftPreset: boolean,
  boundsKey: string,
  presetId?: string,
  filterKey = ''
): string {
  const suffix = filterKey ? `|${filterKey}` : '';
  if (leftPreset) return `${boundsKey}${suffix}`;
  return `${presetId ? `preset:${presetId}` : 'preset-chip'}${suffix}`;
}

export function searchAfterViewportChange(input: {
  leftPreset: boolean;
  boundsKey: string;
  lastPresetKey: string;
  /** Programmatic fly / ease / shrink-first resize — wait for idle. */
  cameraBusy?: boolean;
  /** Stable id for this settle (`preset:tokyo` or a bbox key). */
  settleKey?: string;
  /**
   * Initial load or a re-selected preset: search even if the settle key
   * still matches a cancelled debounce that never dispatched.
   */
  forceSettle?: boolean;
}): { action: SearchTrigger; nextPresetKey?: string } {
  if (input.cameraBusy) {
    return { action: 'skip' };
  }
  if (!input.leftPreset) {
    const key = input.settleKey ?? 'preset-chip';
    if (!input.forceSettle && key === input.lastPresetKey) return { action: 'skip' };
    return { action: 'filters', nextPresetKey: key };
  }
  if (!input.boundsKey) return { action: 'skip' };
  if (!input.forceSettle && input.boundsKey === input.lastPresetKey) {
    return { action: 'skip' };
  }
  return { action: 'moveend', nextPresetKey: input.boundsKey };
}

/**
 * Remember the settle key only when /search actually goes out.
 * A cancelled 200ms debounce must leave `lastKey` untouched so idle
 * can still search (fresh load, re-selected preset, slow wheel).
 */
export function rememberSettleKeyOnDispatch(
  lastKey: string,
  decision: { action: SearchTrigger; nextPresetKey?: string },
  dispatched: boolean
): string {
  if (!dispatched || decision.action === 'skip') return lastKey;
  return decision.nextPresetKey ?? lastKey;
}

export function searchDebounceMs(action: SearchTrigger): number {
  if (action === 'moveend') return SEARCH_DEBOUNCE_MS.moveend;
  if (action === 'filters') return SEARCH_DEBOUNCE_MS.filters;
  return 0;
}

/**
 * Latest-wins timer. A newer call cancels the pending one so overlapping
 * moveend / filter keystrokes do not stack searches.
 */
export function createDebounced<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number
): {
  call: (...args: T) => void;
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: T | null = null;

  const invoke = () => {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };

  return {
    call(...args: T) {
      lastArgs = args;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(invoke, delayMs);
    },
    cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      lastArgs = null;
    },
    flush() {
      if (timer == null) return;
      clearTimeout(timer);
      invoke();
    },
    pending() {
      return timer != null;
    },
  };
}
