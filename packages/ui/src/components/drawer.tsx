'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useDismissable, useMounted } from '../lib/use-dismissable';
import { cn } from '../lib/utils';

// ─── Drawer ───────────────────────────────────────────────────────────────────
// Edge slide-over panel. Used for the mobile secondary-navigation menu.

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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in-overlay cursor-default bg-black/40"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex h-dvh w-[85vw] max-w-xs flex-col bg-white shadow-2xl outline-none',
          side === 'left'
            ? 'left-0 animate-slide-in-from-left'
            : 'right-0 animate-slide-in-from-right',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
