import { useCoachingAvailability } from '@/features/coaching/use-coaching-availability';
import { useFlagsState } from '@/features/flags/use-flags';
import { useTrainerStatus } from '@/features/trainer/use-trainer-status';
import { trpc } from '@/lib/trpc';
import { TRAINER_MODE_LIMITS, type TrainerBadgesDto } from '@chefer/types';
import { isTrainerModeAvailable } from '@chefer/utils';

export interface TrainerModeState {
  /** The `trainerMode` flag is on and the user's trainer tools are active (§5.1). */
  available: boolean;
  /** Still finding out; `available` reads false until then, so wait before redirecting. */
  isLoading: boolean;
  /** `trainer.badges` (§7.1), null until known or while trainer mode is unavailable. */
  badges: TrainerBadgesDto | null;
  /** The trainer-tools status the answer came from (name, gym line, client count). */
  status: ReturnType<typeof useTrainerStatus>;
}

/**
 * Trainer mode (docs/prd-2026-10/trainer-mode.md) for the signed-in user: is
 * the third mode there, and what its badges count. `trainer.badges` is polled
 * every `badgePollMs` while the tab is visible, and never called otherwise
 * (it is a trainer-only procedure).
 */
export function useTrainerMode(): TrainerModeState {
  const { flags, isLoading: flagsLoading } = useFlagsState();
  const coaching = useCoachingAvailability();
  const status = useTrainerStatus();
  const available = isTrainerModeAvailable({
    flag: flags.trainerMode,
    trainerActive: status.active,
  });
  const badges = trpc.trainer.badges.useQuery(undefined, {
    enabled: available,
    refetchInterval: TRAINER_MODE_LIMITS.badgePollMs,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 30_000,
  });
  return {
    available,
    isLoading:
      flagsLoading || (flags.trainerMode === true && (coaching.isLoading || status.isLoading)),
    badges: available ? (badges.data ?? null) : null,
    status,
  };
}
