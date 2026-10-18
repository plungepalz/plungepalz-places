export const SEARCH_DEBOUNCE_MS = {
  /** Filter / query / preset chip — keep the previous heading while this waits. */
  filters: 200,
  /** User map move (moveend → bbox search). */
  moveend: 450,
} as const;

export type SearchTrigger = 'skip' | 'filters' | 'moveend';

/**
 * While a location chip is active, ignore bbox churn from the preset flight
 * so the header can settle with the chip search (fly + 200ms ≤ ~2.6s).
 */
export function viewportSearchIdentity(leftPreset: boolean, boundsKey: string): string {
  return leftPreset ? boundsKey : 'preset-chip';
}

export function searchAfterViewportChange(input: {
  leftPreset: boolean;
  boundsKey: string;
  lastPresetKey: string;
  /** Programmatic fly / ease — do not search on interrupt or mid-flight moveend. */
  cameraBusy?: boolean;
}): { action: SearchTrigger; nextPresetKey?: string } {
  if (!input.leftPreset) {
    return { action: 'filters', nextPresetKey: input.boundsKey };
  }
  if (input.cameraBusy) {
    return { action: 'skip' };
  }
  if (!input.boundsKey || input.boundsKey === input.lastPresetKey) {
    return { action: 'skip' };
  }
  return { action: 'moveend' };
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
