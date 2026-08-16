'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error';

export interface ToastProps {
  message: string;
  type?: ToastType;
  /** Auto-dismiss after this many ms (default 3000). Pass 0 to disable. */
  duration?: number;
  onClose: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ message, type = 'success', duration = 3000, onClose, className }, ref) => {
    React.useEffect(() => {
      if (duration <= 0) return;
      const t = setTimeout(onClose, duration);
      return () => clearTimeout(t);
    }, [duration, onClose]);

    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          // Below sm the toast spans the screen and clears the bottom tab bar
          // (4rem) plus the home indicator; at sm+ it returns to the corner.
          'fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
          'sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm',
          type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
          className,
        )}
      >
        <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">
          {type === 'success' ? '✓' : '✕'}
        </span>
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="shrink-0 rounded opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          ×
        </button>
      </div>
    );
  },
);

Toast.displayName = 'Toast';
