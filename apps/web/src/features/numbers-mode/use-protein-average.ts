'use client';

import { trpc } from '@/lib/trpc';
import { localDateStr, weeklyAverage } from '@chefer/utils';

/**
 * The protein-only weekly average (WP-08): the last logged days' mean protein,
 * from the same `tracker.weeklySummary` + `weeklyAverage` the Today weekly line
 * uses (today is left out, at least two logged days). `null` while it loads or
 * when there is too little to average. The query only runs when `enabled`, so
 * full-mode screens never pay for it.
 */
export function useProteinWeekAverage(enabled: boolean): { protein: number; days: number } | null {
  const todayStr = localDateStr();
  const { data } = trpc.tracker.weeklySummary.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  if (!enabled || !data) return null;
  const avg = weeklyAverage(data.days, todayStr);
  return avg ? { protein: avg.protein, days: avg.days } : null;
}
