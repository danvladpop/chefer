import { useEffect } from 'react';
import { TRAINER_MODE_LIMITS } from '@chefer/types';
import { isNetworkError, isServerError, isTrainerModeAvailable } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { localDate } from '../gym/offline/ids';
import { useCoachingAvailability } from '../trainer/api/use-coaching-availability';
import { setTrainerModeAvailableCache, useTrainerModeAvailableCached } from './mode-store';

// ─── Trainer mode: who gets it, and its badge (trainer-mode.md §5.1, §7.1) ────
// Available = the `trainerMode` flag AND active trainer tools. The chain asks
// as little as it can: `profile.flags` first (shared, cached forever), then
// `coaching.availability` (canBeTrainer), and only then `trainer.status` —
// so a user who can never be a trainer never calls a trainer.* procedure.
// `live` is undefined until the chain has a real answer (pending, offline,
// 5xx); a 4xx is an answer (an old API, coaching off): not available.

function isAnswer(error: unknown): boolean {
  return !isNetworkError(error) && !isServerError(error);
}

/** The live answer, or undefined while there is none yet. */
export function useLiveTrainerModeAvailability(): boolean | undefined {
  const flags = trpc.profile.flags.useQuery(undefined, { staleTime: Infinity, retry: false });
  const flagOn = flags.data?.trainerMode === true;
  const coaching = useCoachingAvailability();
  const status = trpc.trainer.status.useQuery(undefined, {
    retry: false,
    enabled: flagOn && coaching.canBeTrainer,
  });

  if (flags.data === undefined) return flags.isError && isAnswer(flags.error) ? false : undefined;
  if (!flagOn) return false;
  if (coaching.isLoading || coaching.unreachable) return undefined;
  if (!coaching.canBeTrainer) return false;
  if (status.data) {
    return isTrainerModeAvailable({ flag: flagOn, trainerActive: status.data.active });
  }
  if (status.isError && isAnswer(status.error)) return false;
  return undefined;
}

/**
 * Whether trainer mode is available: the live answer once there is one, the
 * cached answer from the last launch until then. Keeps the cache in step.
 */
export function useTrainerModeAvailability(): boolean {
  return useTrainerModeAnswer().available;
}

function useTrainerModeAnswer(): { available: boolean; live: boolean | undefined } {
  const live = useLiveTrainerModeAvailability();
  const cached = useTrainerModeAvailableCached();
  useEffect(() => {
    if (live !== undefined) setTrainerModeAvailableCache(live);
  }, [live]);
  return { available: live ?? cached, live };
}

export type TrainerBadgesState = {
  /** Pending coaching requests: the Clients tab badge. */
  requests: number;
  /** Lane K4: clients who went quiet since the trainer last opened Today (the Today tab's badge). */
  quiet: number;
  /** Everything waiting in trainer mode: personal mode's You badge and switch row. */
  total: number;
  /** A `trainer.badges` answer has arrived (0s before that mean "unknown"). */
  loaded: boolean;
  refetch: () => Promise<unknown>;
};

/**
 * `trainer.badges` (§7.1), the one count source for every trainer badge. Same
 * freshness as Following's badge (use-friends-me.ts): a 60 s poll while the
 * app is in the foreground and a refetch on every return to it. Runs only
 * once the LIVE answer says trainer mode is available (the cached one may
 * be stale, and a trainer.* call would only be refused); 0 while off or loading.
 */
export function useTrainerBadges(): TrainerBadgesState {
  const available = useTrainerModeAnswer().live === true;
  // Lane K4: the device-local day judges who is quiet (an older API ignores it).
  const query = trpc.trainer.badges.useQuery(
    { today: localDate() },
    {
      enabled: available,
      refetchInterval: available ? TRAINER_MODE_LIMITS.badgePollMs : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: 'always',
      retry: false,
    },
  );
  const data = available ? query.data : undefined;
  const { refetch } = query;
  return {
    requests: Math.max(0, data?.requests ?? 0),
    quiet: Math.max(0, data?.quietClients ?? 0),
    total: Math.max(0, data?.total ?? 0),
    loaded: data !== undefined,
    refetch: () => (available ? refetch() : Promise.resolve()),
  };
}
