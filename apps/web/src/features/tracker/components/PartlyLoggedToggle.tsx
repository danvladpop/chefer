'use client';

import { useState } from 'react';
import { ToggleRow } from '@/features/gym/shared/toggle-row';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { PARTLY_LOGGED_COPY } from '@chefer/utils';

// ─── "Partly logged day" (market review 2026-10, lane D2) ────────────────────
// One switch under a day's log: the day still counts as logged, but the
// Sunday review leaves it out of its averages. Optimistic; a failed save
// flips back and says so. Same copy as the app (PARTLY_LOGGED_COPY).

export function PartlyLoggedToggle({ date, incomplete }: { date: string; incomplete: boolean }) {
  const utils = trpc.useUtils();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const mutation = trpc.tracker.setDayIncomplete.useMutation({
    onSuccess: (result) => {
      capture('day_incomplete_set', { incomplete: result.incomplete });
      // Write the answer into the cached day first, so the switch doesn't
      // flick back while the refetch is in flight.
      utils.tracker.getDay.setData({ date }, (day) =>
        day ? { ...day, incomplete: result.incomplete } : day,
      );
      void utils.tracker.getDay.invalidate({ date });
    },
    onSettled: () => setOptimistic(null),
  });

  return (
    <div data-testid="tracker-partly-logged" className="mt-4">
      <ToggleRow
        label={PARTLY_LOGGED_COPY.label}
        hint={mutation.isError ? PARTLY_LOGGED_COPY.saveError : PARTLY_LOGGED_COPY.detail}
        checked={optimistic ?? incomplete}
        onChange={(on) => {
          if (mutation.isPending) return;
          setOptimistic(on);
          mutation.mutate({ date, incomplete: on });
        }}
      />
    </div>
  );
}
