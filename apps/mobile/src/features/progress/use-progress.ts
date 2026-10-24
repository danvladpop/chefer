import type { ProgressSummary } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { useFlags } from '../../hooks/use-flags';
import { trpc } from '../../lib/trpc';
import { useShellV2 } from '../shell/shell-store';

// ─── Kitchen progress: the gate (build-plan.md Lane C) ───────────────────────
// Nothing of Kitchen progress renders, and no `progress.*` query fires, unless
// all three agree: the `gamification` flag (profile.flags), the revamp shell
// (D7, production runs `mobileShellV2`) and the server's own answer
// (`progress.availability`, which also honours GAMIFICATION_ALLOWLIST). The
// availability query itself only runs once the first two say yes, so a flag-off
// user costs the API nothing. The one exception is `progress.finishCook`: the
// cook is recorded for everyone (D1) — see use-finish-cook.ts.

const AVAILABILITY_STALE_MS = 5 * 60_000;
const SUMMARY_STALE_MS = 30_000;

/** True when Kitchen progress is on for this user, on this shell. */
export function useProgressEnabled(): boolean {
  const { gamification } = useFlags();
  const shellV2 = useShellV2();
  const eligible = gamification && shellV2;
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
