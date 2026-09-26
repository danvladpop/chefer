'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { duration } from '@chefer/tokens';
import { useDismissable, useMounted } from '../lib/use-dismissable';
import { cn } from '../lib/utils';
import { usePresence } from '../motion/use-presence';
import { useReducedMotion } from '../motion/use-reduced-motion';

// ─── Drawer ───────────────────────────────────────────────────────────────────
// Edge slide-over panel. Used for the mobile secondary-navigation menu.
//
// Motion (MO-02): the scrim fades while the panel slides in from its edge
// (320 ms, enter curve) and back out (220 ms, exit curve); the portal unmounts
// only after the exit (usePresence), and the closing drawer is inert and
// click-through at once. Reduced motion: a 150 ms crossfade, no movement.

const SCRIM = {
  open: 'animate-in fade-in-0 duration-base ease-standard',
  closed: 'animate-out fade-out-0 fill-mode-forwards duration-fast ease-exit',
} as const;

const PANEL = {
  left: {
    open: 'animate-in slide-in-from-left-full duration-slow ease-enter',
    closed: 'animate-out fill-mode-forwards slide-out-to-left-full duration-base ease-exit',
  },
  right: {
    open: 'animate-in slide-in-from-right-full duration-slow ease-enter',
    closed: 'animate-out fill-mode-forwards slide-out-to-right-full duration-base ease-exit',
  },
} as const;

const REDUCED = {
  open: 'animate-in fade-in-0 duration-fast',
  closed: 'animate-out fade-out-0 fill-mode-forwards duration-fast',
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

export function Drawer({ open, onClose, label, children, side = 'left', className }: DrawerProps) {
  const panelRef = useDismissable<HTMLDivElement>({ open, onClose });
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const { present, state, onAnimationEnd } = usePresence(
    open,
    reduced ? duration.fast : duration.base,
  );
  const closing = state === 'closed';

  if (!mounted || !present) return null;

  return createPortal(
    <div
      data-state={state}
      aria-hidden={closing || undefined}
      inert={closing}
      className={cn('fixed inset-0 z-50', closing && 'pointer-events-none')}
    >
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        data-motion-safe
        className={cn(
          'absolute inset-0 cursor-default bg-black/40',
          reduced ? REDUCED[state] : SCRIM[state],
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-state={state}
        data-motion-safe
        onAnimationEnd={onAnimationEnd}
        className={cn(
          'absolute inset-y-0 flex h-dvh w-[85vw] max-w-xs flex-col bg-white shadow-e4 outline-none',
          side === 'left' ? 'left-0' : 'right-0',
          reduced ? REDUCED[state] : PANEL[side][state],
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
