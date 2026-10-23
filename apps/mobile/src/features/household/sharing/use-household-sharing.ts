import type { HouseholdSharingStatus } from '@chefer/types';
import { trpc } from '../../../lib/trpc';

// ─── Household sharing state (ADR 0002) ───────────────────────────────────────
// One cached `household.sharing` read for every screen that changes with it
// (Household, Meals, Shop, You). `enabled` is the `householdSharing` flag:
// false hides every entry point. A failed or pending read counts as off, so a
// screen never shows sharing UI it cannot back.

export type HouseholdSharing = {
  status: HouseholdSharingStatus | undefined;
  enabled: boolean;
  /** The week and list are shared: the household has a partner, or I am one. */
  shared: boolean;
  isPartner: boolean;
  isOwner: boolean;
  /** PARTNER: whose household this is. */
  ownerName: string | null;
};

export function householdSharingFrom(status: HouseholdSharingStatus | undefined): HouseholdSharing {
  const enabled = status?.enabled === true;
  const role = enabled ? status.role : 'SOLO';
  return {
    status: enabled ? status : undefined,
    enabled,
    shared: role !== 'SOLO',
    isPartner: role === 'PARTNER',
    isOwner: role === 'OWNER',
    ownerName: role === 'PARTNER' ? (status?.owner?.name ?? null) : null,
  };
}

export const HOUSEHOLD_SHARING_STALE_MS = 60_000;

export function useHouseholdSharing(): HouseholdSharing {
  const { data } = trpc.household.sharing.useQuery(undefined, {
    staleTime: HOUSEHOLD_SHARING_STALE_MS,
  });
  return householdSharingFrom(data);
}

/** Everything a join, leave or removal changes: whose week, list and members this account reads. */
export function useInvalidateHousehold(): () => void {
  const utils = trpc.useUtils();
  return () => {
    void utils.household.invalidate();
    void utils.mealPlan.invalidate();
    void utils.shoppingList.invalidate();
    void utils.safety.getTable.invalidate();
    void utils.preferences.get.invalidate();
    void utils.dashboard.summary.invalidate();
  };
}
