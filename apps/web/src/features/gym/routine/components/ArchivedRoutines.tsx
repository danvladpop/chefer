'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RoutineListItemDto } from '@chefer/types';
import { Button } from '@chefer/ui';

// UX-GYM-34: an archived routine used to be listed with the live ones and could
// only come back through "Set active". This collapsible "Archived" section lists
// them with Restore (comes back inactive; history is kept either way). The web
// twin of the phone's `archived-routines.tsx`.

export function ArchivedRoutines({
  rows,
  restoringId,
  disabled,
  onRestore,
}: {
  rows: RoutineListItemDto[];
  /** The routine whose restore is in flight (spinner on its button). */
  restoringId: string | null;
  disabled: boolean;
  onRestore: (routine: RoutineListItemDto) => void;
}) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  return (
    <section className="border-t pt-2" data-testid="routines-archived">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="routines-archived-toggle"
        className="flex min-h-11 w-full items-center justify-between text-sm font-medium text-neutral-700"
      >
        {`Archived (${rows.length})`}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <ul className="divide-y">
          {rows.map((routine) => (
            <li
              key={routine.id}
              data-testid={`routines-archived-item-${routine.id}`}
              className="flex min-h-14 items-center gap-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {routine.name}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {`${routine.dayCount} ${routine.dayCount === 1 ? 'day' : 'days'} · past workouts keep their history`}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                aria-label={`Restore ${routine.name}`}
                data-testid={`routines-archived-restore-${routine.id}`}
                loading={restoringId === routine.id}
                disabled={disabled}
                onClick={() => onRestore(routine)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
