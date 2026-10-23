import { useCallback } from 'react';
import { HOUSEHOLD_SHARING_COPY, HOUSEHOLD_SHARING_LIMITS } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { useHouseholdSharing, type HouseholdSharing } from './use-household-sharing';

// ─── The shared week on Meals (ADR 0002) ──────────────────────────────────────
// Both Meals screens (the new shell's and the old (food) Plan tab) read this: how often to refetch the
// week while it is on screen (only when the household is shared), whether the reader is a partner (the
// owner-only planning actions go, `ownerOnly` says why), and the one handler for a slot edit that lost
// a race with the other person ("This meal changed a moment ago." + the latest week).

/** A swap / replace / pin / remove refused because the slot no longer holds the expected recipe. */
export function isMealSlotConflict(error: unknown): boolean {
  const data = (error as { data?: { code?: unknown; conflict?: { kind?: unknown } | null } } | null)
    ?.data;
  return data?.code === 'CONFLICT' && data.conflict?.kind === 'mealSlot';
}

export type SharedWeek = HouseholdSharing & {
  /** The Meals refetch interval while focused (false = no polling: a solo household). */
  pollMs: number | false;
  /**
   * For a slot edit's onError: on a `mealSlot` conflict shows the snackbar, refetches the week and
   * returns true (the caller shows nothing else). Any other error returns false.
   */
  handleSlotConflict: (error: unknown, refetch: () => unknown) => boolean;
};

export function useSharedWeek(): SharedWeek {
  const sharing = useHouseholdSharing();
  const { show } = useSnackbar();
  const handleSlotConflict = useCallback(
    (error: unknown, refetch: () => unknown) => {
      if (!isMealSlotConflict(error)) return false;
      track('shared_plan_conflict', {});
      show({ message: HOUSEHOLD_SHARING_COPY.conflictSomeone });
      void refetch();
      return true;
    },
    [show],
  );
  return {
    ...sharing,
    pollMs: sharing.shared ? HOUSEHOLD_SHARING_LIMITS.planPollMs : false,
    handleSlotConflict,
  };
}
