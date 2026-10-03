import type { UnitSystem } from '@chefer/utils';
import { trpc } from '../lib/trpc';

/**
 * Mirror of apps/web/src/hooks/useUnitSystem.ts — the user's preferred
 * measurement system, defaulting to METRIC while loading / without a profile.
 *
 * WP-11 (audit §6.4): a freshly fetched value, never a minute-old copy — each
 * screen visit re-reads `preferredUnits` once it is more than a few seconds
 * old, so a change made on another screen (or device) shows up everywhere.
 * `useUnits()` is the hook screens use; this is its source.
 */
export const UNITS_STALE_MS = 10_000;

export function useUnitSystem(): UnitSystem {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: UNITS_STALE_MS });
  return data?.chefProfile?.preferredUnits ?? 'METRIC';
}
