'use client';

import { trpc } from '@/lib/trpc';
import type { HouseholdRole, HouseholdSharingStatus } from '@chefer/types';

// ─── Household sharing state (ADR 0002) ───────────────────────────────────────
// One query for every screen that changes when a household is shared. With the
// `householdSharing` flag off (`enabled: false`) everything reads as SOLO, so
// no entry point shows.

export type HouseholdSharing = {
  /** The status when the flag is on for this user, else null. */
  status: HouseholdSharingStatus | null;
  role: HouseholdRole;
  /** The household has a partner: shared week, live list. */
  isShared: boolean;
  isPartner: boolean;
  /** PARTNER: the owner's first name. */
  ownerName: string | null;
};

export function useHouseholdSharing(): HouseholdSharing {
  const { data } = trpc.household.sharing.useQuery(undefined, { staleTime: 30_000 });
  const status = data?.enabled === true ? data : null;
  const role: HouseholdRole = status?.role ?? 'SOLO';
  return {
    status,
    role,
    isShared: role !== 'SOLO',
    isPartner: role === 'PARTNER',
    ownerName: status?.owner?.name ?? null,
  };
}
