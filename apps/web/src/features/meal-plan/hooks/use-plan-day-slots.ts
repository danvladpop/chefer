'use client';

import { useSlotActions } from '@/features/tracker/lib/use-slot-actions';
import type { ShowToast } from '@/features/tracker/lib/use-tracker-writes';
import { trpc } from '@/lib/trpc';
import { localDateStr } from '@chefer/utils';
import type { PlanSlotUi } from '../components/PlanSlotShell';

// The "Ate something else" / "Skipped it" flow for one Plan day (WP-06): that
// day's log (what was eaten, replaced or skipped) plus the shared flow. `date`
// is null for a day that can't be logged (a future day, a past week) — the
// query stays off and `slotUi` is undefined, so no overflow shows.
export function usePlanDaySlots(date: string | null, showToast: ShowToast) {
  const day = trpc.tracker.getDay.useQuery(
    { date: date ?? localDateStr() },
    { enabled: date !== null, staleTime: 30_000 },
  );
  const flow = useSlotActions(date ?? localDateStr(), showToast);
  const slotUi: PlanSlotUi | undefined =
    date !== null && day.data
      ? {
          flow,
          loggedMeals: day.data.log?.loggedMeals ?? [],
          skippedSlots: day.data.skippedSlots ?? [],
        }
      : undefined;
  return { flow, slotUi };
}
