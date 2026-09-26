'use client';

import * as React from 'react';

// ─── Menu button behaviour ────────────────────────────────────────────────────
// WAI-ARIA menu-button pattern for small dropdowns (user menu, overflow "…"
// menus). Replaces the old hand-rolled `fixed inset-0` click-catcher, which had
// no Escape, no focus management and let Tab wander into the page behind:
// - opening moves focus to the first `[role="menuitem"]`
// - Escape closes and returns focus to the trigger
// - ArrowUp/ArrowDown/Home/End move between items (wrapping)
// - Tab closes and lets focus continue naturally (menus aren't tab stops)
// - a pointerdown outside the root closes it
// Items should render with `role="menuitem"` and `tabIndex={-1}`.

export interface UseMenuResult {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Close, optionally returning focus to the trigger. */
  close: (restoreFocus?: boolean) => void;
  /** Wraps trigger + menu; outside pointerdowns close the menu. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  triggerProps: {
    ref: React.RefObject<HTMLButtonElement | null>;
    id: string;
    type: 'button';
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  };
  menuProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    id: string;
    role: 'menu';
    'aria-labelledby': string;
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  };
}

export function useMenu(): UseMenuResult {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const triggerId = React.useId();

  const items = React.useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
      ),
    [],
  );

  const close = React.useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open, items]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number): void => list[(i + list.length) % list.length]?.focus();

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  return {
    open,
    setOpen,
    close,
    rootRef,
    triggerProps: {
      ref: triggerRef,
      id: triggerId,
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-controls': open ? menuId : undefined,
      onClick: () => setOpen((p) => !p),
      onKeyDown: onTriggerKeyDown,
    },
    menuProps: {
      ref: menuRef,
      id: menuId,
      role: 'menu',
      'aria-labelledby': triggerId,
      onKeyDown: onMenuKeyDown,
    },
  };
}
