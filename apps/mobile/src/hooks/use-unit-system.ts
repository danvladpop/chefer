import type { UnitSystem } from '@chefer/utils';
import { trpc } from '../lib/trpc';

/**
 * Mirror of apps/web/src/hooks/useUnitSystem.ts — the user's preferred
 * measurement system, defaulting to METRIC while loading / without a profile.
 */
export function useUnitSystem(): UnitSystem {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  return data?.chefProfile?.preferredUnits ?? 'METRIC';
}
