'use client';

import { trpc } from '@/lib/trpc';

// ─── Household hook (F2) ──────────────────────────────────────────────────────
// One query, shared derivations. `portionSum` mirrors the API's
// computeHouseholdContext math (ceil of owner 1 + Σ member portionFactor) so
// cook mode and the recipe page default to the same serving count the
// generated plan was built with.

export interface HouseholdMemberDto {
  id: string;
  name: string;
  portionFactor: number;
  isKid: boolean;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
}

export function useHousehold(): {
  members: HouseholdMemberDto[];
  isLoading: boolean;
  /** Members only (0 when none). */
  memberCount: number;
  /** People at the table: owner + members. */
  peopleCount: number;
  /** ceil(1 + Σ portionFactor), or null when the household is just the owner. */
  portionSum: number | null;
} {
  const { data, isLoading } = trpc.household.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const members = data ?? [];
  const memberCount = members.length;
  const portionSum =
    memberCount > 0
      ? Math.ceil(members.reduce((sum, m) => sum + Math.max(0, m.portionFactor), 1))
      : null;
  return { members, isLoading, memberCount, peopleCount: memberCount + 1, portionSum };
}
