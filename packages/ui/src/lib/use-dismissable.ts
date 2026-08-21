'use client';

import * as React from 'react';

// ─── Shared overlay behaviour ─────────────────────────────────────────────────
// Body scroll lock + Escape-to-close + focus trap + focus restore. Used by both
// Sheet and Drawer so every overlay in the app behaves identically.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ─── Body scroll lock ─────────────────────────────────────────────────────────
// `overflow: hidden` on <body> is not enough on iOS Safari — the page still
// rubber-bands behind the overlay. Pinning the body with position:fixed and
// restoring the scroll offset on unlock is the only approach that holds.
// Ref-counted so nested overlays don't unlock the page early.

let lockCount = 0;
let savedScrollY = 0;

function lockBodyScroll(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${savedScrollY}px`;
    style.left = '0';
    style.right = '0';
    style.overflow = 'hidden';
  }
  lockCount += 1;
}

function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  const { style } = document.body;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  style.overflow = '';
  window.scrollTo(0, savedScrollY);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseDismissableOptions {
  open: boolean;
  onClose: () => void;
  /** Close when Escape is pressed. Default true. */
  closeOnEscape?: boolean;
}

/**
 * Returns a ref to attach to the overlay panel. While `open` is true the hook
 * locks page scroll, traps Tab focus inside the panel, closes on Escape, and
 * restores focus to the previously focused element on unmount.
 */
export function useDismissable<T extends HTMLElement>({
  open,
  onClose,
  closeOnEscape = true,
}: UseDismissableOptions): React.RefObject<T | null> {
  const panelRef = React.useRef<T>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  // Hold the latest onClose in a ref so a caller passing an inline arrow
  // doesn't tear down and re-run the whole effect on every render.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      // getClientRects() rather than offsetParent — the panel is
      // position:fixed, which makes offsetParent unreliable here.
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.getClientRects().length > 0,
      );

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }

      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      unlockBodyScroll();
      restoreRef.current?.focus();
    };
  }, [open, closeOnEscape]);

  return panelRef;
}

/**
 * True once the component has mounted on the client. Portals must not render
 * during SSR — `document` does not exist there.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
