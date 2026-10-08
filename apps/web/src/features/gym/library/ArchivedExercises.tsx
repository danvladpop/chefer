'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ChevronDown } from 'lucide-react';
import type { ExerciseDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { showGymToast } from '../shared/gym-toast';

// UX-GYM-34: an archived custom exercise used to vanish with no way back. This
// collapsible "Archived" section sits under the Exercises list and offers
// Restore (past sessions keep their history either way, so there is no Delete).
// The web twin of the phone's `archived-exercises.tsx`.

export function ArchivedExercises({ rows }: { rows: ExerciseDto[] }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const restore = trpc.gym.library.restoreCustom.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      void utils.gym.library.invalidate();
    },
  });

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 border-t pt-2" data-testid="exercises-archived">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="exercises-archived-toggle"
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
          {rows.map((item) => (
            <li
              key={item.id}
              data-testid={`exercises-archived-item-${item.id}`}
              className="flex min-h-14 items-center gap-3 py-2"
            >
              <Link href={`/gym/exercises/${item.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {item.name}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  Past workouts keep their history
                </span>
              </Link>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Restore ${item.name}`}
                data-testid={`exercises-archived-restore-${item.id}`}
                loading={restore.isPending && restore.variables?.id === item.id}
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(
                    { id: item.id },
                    {
                      onSuccess: () => showGymToast({ message: `Restored “${item.name}”.` }),
                      onError: (err) =>
                        showGymToast({ message: userFacingErrorMessage(err), type: 'error' }),
                    },
                  )
                }
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
