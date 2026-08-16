'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDismissable, useMounted } from '../lib/use-dismissable';
import { cn } from '../lib/utils';

// ─── Sheet ────────────────────────────────────────────────────────────────────
// One responsive dialog for the whole app: a bottom sheet on phones, a centred
// dialog at sm+. Handles scroll lock, focus trap, Escape, backdrop dismiss and
// the iOS home-indicator inset so callers don't have to.

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
} as const;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered as the header title unless `hideHeader`. */
  title: string;
  /** Optional sub-line under the title. */
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned below the scrollable body — actions go here. */
  footer?: React.ReactNode;
  /** Max width at sm+. Default 'md'. */
  size?: keyof typeof SIZES;
  /** Render without the title bar; `title` is still used as the a11y name. */
  hideHeader?: boolean;
  className?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideHeader = false,
  className,
}: SheetProps) {
  const panelRef = useDismissable<HTMLDivElement>({ open, onClose });
  const mounted = useMounted();
  const titleId = React.useId();

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in-overlay cursor-default bg-black/40 sm:backdrop-blur-sm"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[85dvh] w-full flex-col overflow-hidden bg-white shadow-2xl outline-none',
          // Phone: bottom sheet flush to the screen edges, above the home indicator.
          'animate-slide-in-from-bottom rounded-t-3xl pb-safe',
          // sm+: centred dialog, no inset needed.
          'sm:animate-fade-in sm:rounded-2xl sm:pb-0',
          SIZES[size],
          className,
        )}
      >
        {/* Drag affordance — signals "swipe/tap away" on touch. */}
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300 sm:hidden"
        />

        {hideHeader ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-serif text-base font-semibold text-gray-900">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-xs text-gray-400">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body — the only scrollable region; overscroll-contain stops the
            scroll from chaining to the (locked) page behind. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
