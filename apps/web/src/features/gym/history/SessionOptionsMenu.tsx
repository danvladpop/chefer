'use client';

import { MoreHorizontal } from 'lucide-react';
import { useMenu } from '@chefer/ui';

// The row's `⋯` (UX-44, T-44.1/T-44.5): `Delete workout` (with the named confirm
// and Undo). `Edit workout` exists on the phone only for now — the item is shown
// disabled with that hint so the two platforms read the same (the ledger row in
// mobile_parity_backlog.md tracks the web build).

export function SessionOptionsMenu({
  label,
  onDelete,
  testId,
}: {
  /** "Full Body A, Tue 22 Sep" — the accessible name's tail. */
  label: string;
  onDelete: () => void;
  testId: string;
}) {
  const menu = useMenu();
  return (
    <div ref={menu.rootRef} className="relative shrink-0">
      <button
        {...menu.triggerProps}
        aria-label={`Options for ${label}`}
        data-testid={testId}
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {menu.open && (
        <div
          {...menu.menuProps}
          className="absolute right-0 z-30 mt-1 w-56 rounded-xl border bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled
            title="Editing a past workout is in the Chefer phone app for now."
            className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 text-left text-sm text-gray-400"
          >
            Edit workout
            <span className="text-xs">In the phone app for now</span>
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid={`${testId}-delete`}
            onClick={() => {
              menu.close();
              onDelete();
            }}
            className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete workout
          </button>
        </div>
      )}
    </div>
  );
}
