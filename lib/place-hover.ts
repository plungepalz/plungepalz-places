export type HoverSource = 'card' | 'pin';

export type HoverApply = (placeId: string | null) => void;

/**
 * Card/pin hover without a React render: rAF-coalesce to one setFeatureState
 * and a DOM data-map-hover write. Pin hover may scroll the list if the card
 * is clipped; card hover never does.
 */
export function createPlaceHoverController() {
  let raf = 0;
  let pendingId: string | null = null;
  let pendingSource: HoverSource = 'card';
  let currentId: string | null = null;
  let applyFeatureState: HoverApply | null = null;
  let applyCardHighlight: HoverApply | null = null;
  let applyPinScroll: ((placeId: string) => void) | null = null;
  let schedule: (cb: () => void) => number = (cb) => requestAnimationFrame(cb);
  let cancel: (id: number) => void = (id) => cancelAnimationFrame(id);

  const flush = () => {
    raf = 0;
    const id = pendingId;
    const source = pendingSource;
    const changed = id !== currentId;
    currentId = id;
    if (changed) {
      applyFeatureState?.(id);
      applyCardHighlight?.(id);
    }
    if (source === 'pin' && id) applyPinScroll?.(id);
  };

  return {
    setHover(placeId: string | null, source: HoverSource = 'card') {
      pendingId = placeId;
      pendingSource = source;
      if (raf) return;
      raf = schedule(flush);
    },
    bindFeatureState(fn: HoverApply) {
      applyFeatureState = fn;
      return () => {
        if (applyFeatureState === fn) applyFeatureState = null;
      };
    },
    bindCardHighlight(fn: HoverApply) {
      applyCardHighlight = fn;
      return () => {
        if (applyCardHighlight === fn) applyCardHighlight = null;
      };
    },
    bindPinScroll(fn: (placeId: string) => void) {
      applyPinScroll = fn;
      return () => {
        if (applyPinScroll === fn) applyPinScroll = null;
      };
    },
    /** Tests: inject a sync or fake scheduler. */
    installScheduler(nextSchedule: (cb: () => void) => number, nextCancel: (id: number) => void) {
      schedule = nextSchedule;
      cancel = nextCancel;
    },
    current() {
      return currentId;
    },
    dispose() {
      if (raf) cancel(raf);
      raf = 0;
    },
  };
}

export type PlaceHoverController = ReturnType<typeof createPlaceHoverController>;
