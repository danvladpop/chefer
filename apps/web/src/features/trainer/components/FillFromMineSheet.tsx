'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, type RoutineDto } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

/** "Fill from one of my routines": pick one of the trainer's own routines to copy into the draft. */
export function FillFromMineSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (routine: RoutineDto) => void;
}) {
  const utils = trpc.useUtils();
  const list = trpc.gym.routine.list.useQuery(undefined, { enabled: open, retry: false });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (list.data ?? []).filter((r) => !r.archived);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COACHING_COPY.trainer.fillFromMine}
      description="Copies the days into the draft below. Nothing is saved until you press Save changes."
      size="md"
    >
      <div className="px-3 pb-4">
        {list.isLoading ? (
          <div className="mx-2 h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-500">
            You have no routines of your own yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={loadingId !== null}
                  onClick={async () => {
                    setError(null);
                    setLoadingId(row.id);
                    try {
                      onPick(await utils.gym.routine.get.fetch({ id: row.id }));
                    } catch (err) {
                      setError(userFacingErrorMessage(err));
                    } finally {
                      setLoadingId(null);
                    }
                  }}
                  className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span className="min-w-0 break-words text-sm font-medium text-gray-900">
                    {row.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {row.dayCount} day{row.dayCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="px-3 pt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
