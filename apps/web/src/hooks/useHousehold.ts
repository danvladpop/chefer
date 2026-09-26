'use client';

import { trpc } from '@/lib/trpc';
import { householdPortionSum } from '@chefer/utils';
import { useIsPremium } from './useIsPremium';

// ─── Household hook (F2, backlog P2-3) ────────────────────────────────────────
// One query, shared derivations. Members are free on every tier (their
// allergies filter every plan); SCALING to the table is premium. So
// `tablePortions` is always the table's size, while `portionSum` — what cook
// mode and the recipe page default their servings to — is set only when the
// viewer's tier scales (the same number the API sizes lists and costs to).

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
  /** ceil(1 + Σ portionFactor) when there are members, else null — any tier. */
  tablePortions: number | null;
  /** tablePortions when this tier scales servings and lists (premium), else null. */
  portionSum: number | null;
  /** True when lists, costs and servings are sized for the whole table. */
  scalesForTable: boolean;
} {
  const isPremium = useIsPremium();
  const { data, isLoading } = trpc.household.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const members = data ?? [];
  const memberCount = members.length;
  const tablePortions = memberCount > 0 ? householdPortionSum(members) : null;
  const scalesForTable = isPremium === true && tablePortions !== null;
  return {
    members,
    isLoading,
    memberCount,
    peopleCount: memberCount + 1,
    tablePortions,
    portionSum: scalesForTable ? tablePortions : null,
    scalesForTable,
  };
}
