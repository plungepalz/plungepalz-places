'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function isFocusInFormOrMap(container: HTMLElement | null, node: EventTarget | null): boolean {
  if (!(node instanceof Node)) return false;
  if (container?.contains(node)) return true;
  return node instanceof Element && Boolean(node.closest('[data-places-map]'));
}

/**
 * Dialog a11y: focus the initial control on open, close on Escape, and restore
 * focus to the previously focused element. Modal dialogs also trap Tab.
 * Non-modal dialogs (add-a-place) skip the trap so the map behind stays usable,
 * and only close on Escape when focus is inside the form or on the map.
 */
export function useDialogA11y({
  onClose,
  initialFocusRef,
  containerRef,
  modal = true,
}: {
  onClose: () => void;
  initialFocusRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  modal?: boolean;
}): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!modal && !isFocusInFormOrMap(containerRef.current, document.activeElement)) {
          return;
        }
        event.preventDefault();
        onClose();
        return;
      }
      if (!modal || event.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, containerRef, modal]);
}
