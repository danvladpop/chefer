import { useSyncExternalStore } from 'react';
import type { ProgressSummary } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { getToken, subscribe } from '../../lib/auth-store';
import { trpc } from '../../lib/trpc';
import { useShellV2 } from '../shell/shell-store';

// ─── Kitchen progress: the gate (build-plan.md Lane C) ───────────────────────
// Nothing of Kitchen progress renders, and no other `progress.*` query fires,
// unless the server says so: `progress.availability` = the `gamification` flag
// OR the user's email on GAMIFICATION_ALLOWLIST (the dogfood). It is asked
// only on the revamp shell (D7) and when signed in. Not `profile.flags`: that
// is global, so an allowlisted user would never see it while the flag is off.
// The one exception is `progress.finishCook`: the cook is recorded for
// everyone (D1) — see use-finish-cook.ts.

const AVAILABILITY_STALE_MS = 5 * 60_000;
const SUMMARY_STALE_MS = 30_000;

/** True when Kitchen progress is on for this user, on this shell. */
export function useProgressEnabled(): boolean {
  const signedIn = useSyncExternalStore(subscribe, getToken) !== null;
  const shellV2 = useShellV2();
  const eligible = signedIn && shellV2;
  const { data } = trpc.progress.availability.useQuery(undefined, {
    enabled: eligible,
    staleTime: AVAILABILITY_STALE_MS,
    retry: false,
  });
  return eligible && data?.enabled === true;
}

export interface UseProgressSummary {
  enabled: boolean;
  /** Undefined while loading, on error, and always while the gate is off. */
  summary: ProgressSummary | undefined;
  /** The summary failed to load and there is nothing cached to show. */
  isError: boolean;
  refetch: () => void;
}

/** The Today / You / host view of `progress.summary`, gated. */
export function useProgressSummary(): UseProgressSummary {
  const enabled = useProgressEnabled();
  const query = trpc.progress.summary.useQuery(
    { localDate: localDateStr() },
    { enabled, staleTime: SUMMARY_STALE_MS },
  );
  return {
    enabled,
    summary: enabled ? query.data : undefined,
    isError: enabled && query.isError && query.data === undefined,
    refetch: () => void query.refetch(),
  };
}
