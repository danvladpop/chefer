'use client';

import { trpc } from '@/lib/trpc';
import type { UnitSystem } from '@chefer/utils';

/**
 * The user's preferred measurement unit system (set in Preferences).
 * Defaults to METRIC while loading or when no profile exists.
 */
export function useUnitSystem(): UnitSystem {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  return (data?.chefProfile?.preferredUnits as UnitSystem | undefined) ?? 'METRIC';
}
