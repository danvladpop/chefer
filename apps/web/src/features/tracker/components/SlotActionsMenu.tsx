'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Sheet } from '@chefer/ui';

// ─── Slot overflow: "Ate something else" / "Skipped it" (WP-06) ───────────────
// The "⋯" next to a planned slot's "I ate this". It opens a small Sheet rather
// than a dropdown: every host (Today's cards, the Plan row) clips overflow, and
// a Sheet is the shared overlay with focus trap, Escape and scroll lock. The
// copy is plain on purpose — neither action is a failure.

interface SlotActionsMenuProps {
  /** "Dinner" — names the slot in the button's label and the sheet's title. */
  slotLabel: string;
  /** The planned recipe, under the title. */
  plannedName?: string | undefined;
  onAteElse: () => void;
  onSkip: () => void;
  /** A slot already ticked cannot be skipped (the server refuses); it can still be replaced. */
  canSkip?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function SlotActionsMenu({
  slotLabel,
  plannedName,
  onAteElse,
  onSkip,
  canSkip = true,
  disabled = false,
  className,
}: SlotActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  const item =
    'flex min-h-11 w-full items-center rounded-xl border border-neutral-200 bg-white px-4 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50';

  return (
    // Cards that host this are links: keep taps (and those bubbling out of the
    // Sheet's portal) from navigating.
    <span onClick={(e) => e.stopPropagation()} className="contents">
      <button
        type="button"
        data-testid={`slot-actions-${slotLabel.toLowerCase()}`}
        aria-label={`More actions for ${slotLabel}`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className={
          className ??
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-50'
        }
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={slotLabel}
        description={plannedName}
        size="sm"
      >
        <div className="flex flex-col gap-2 px-5 pb-5">
          <button
            type="button"
            data-testid="slot-action-ate-else"
            onClick={() => choose(onAteElse)}
            className={item}
          >
            Ate something else
          </button>
          {canSkip && (
            <button
              type="button"
              data-testid="slot-action-skip"
              onClick={() => choose(onSkip)}
              className={item}
            >
              Skipped it
            </button>
          )}
        </div>
      </Sheet>
    </span>
  );
}
