'use client';

import { trpc } from '@/lib/trpc';
import type { ProgressSummary } from '@chefer/types';
import { localDateStr } from '@chefer/utils';

// ─── The Kitchen progress gate (build-plan lane D) ────────────────────────────
// `trpc.progress.availability` → `enabled`: the server's answer, the
// `gamification` flag OR the user's email on GAMIFICATION_ALLOWLIST (the
// dogfood). Not `profile.flags`, which is global — an allowlisted user would
// never see it while the flag is off. With the gate off nothing renders and no
// other `progress.*` call is made. `finishCook` is the one exception: the cook
// is recorded for everyone (D1). Used only on signed-in (dashboard) pages.

export function useProgressEnabled(): { enabled: boolean; isLoading: boolean } {
  const availability = trpc.progress.availability.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    enabled: availability.data?.enabled === true,
    isLoading: availability.isPending,
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
