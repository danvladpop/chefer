'use client';

import { useFlags } from '@/features/flags/use-flags';
import { trpc } from '@/lib/trpc';
import type { ProgressSummary } from '@chefer/types';
import { localDateStr } from '@chefer/utils';

// ─── The Kitchen progress gate (build-plan lane D) ────────────────────────────
// `useFlags().gamification && trpc.progress.availability` → `enabled`. With the
// gate off nothing renders and no `progress.*` call is made (the availability
// query itself waits for the flag). `finishCook` is the one exception: the cook
// is recorded for everyone (D1).

export function useProgressEnabled(): { enabled: boolean; isLoading: boolean } {
  const flags = useFlags();
  const flagOn = flags.gamification === true;
  const availability = trpc.progress.availability.useQuery(undefined, {
    enabled: flagOn,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    enabled: flagOn && availability.data?.enabled === true,
    isLoading: flagOn && availability.isPending,
  };
}

export type ProgressSummaryState = {
  enabled: boolean;
  summary: ProgressSummary | undefined;
  isLoading: boolean;
  isError: boolean;
};

/** The day's summary (XP, Flame, Today's three, settings), only when the gate is on. */
export function useProgressSummary(): ProgressSummaryState {
  const { enabled, isLoading: gateLoading } = useProgressEnabled();
  const query = trpc.progress.summary.useQuery(
    { localDate: localDateStr() },
    { enabled, staleTime: 30_000, retry: false },
  );
  return {
    enabled,
    summary: enabled ? query.data : undefined,
    isLoading: gateLoading || (enabled && query.isPending),
    isError: enabled && query.isError,
  };
}
