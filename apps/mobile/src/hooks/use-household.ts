import { householdPortionSum } from '@chefer/utils';
import { trpc } from '../lib/trpc';
import { useIsPremium } from './use-is-premium';

/**
 * Mirror of apps/web/src/hooks/useHousehold.ts (backlog P2-3). Members are
 * free on every tier; SCALING to the table is premium, so `portionSum` — what
 * the recipe screen defaults its servings to — is set only for premium
 * households (the same number the API sizes lists and costs to).
 */
export function useHousehold(): {
  memberCount: number;
  tablePortions: number | null;
  portionSum: number | null;
} {
  const isPremium = useIsPremium();
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const tablePortions = members.length > 0 ? householdPortionSum(members) : null;
  return {
    memberCount: members.length,
    tablePortions,
    portionSum: isPremium === true ? tablePortions : null,
  };
}
