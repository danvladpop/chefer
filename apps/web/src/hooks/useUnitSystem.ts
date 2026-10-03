'use client';

import { trpc } from '@/lib/trpc';
import type { UnitSystem } from '@chefer/utils';

/**
 * The user's preferred measurement unit system (set in Preferences).
 * Defaults to METRIC while loading or when no profile exists.
 *
 * WP-11 (audit §6.4): a freshly fetched value, never a minute-old copy — it
 * is re-read on mount once it is more than a few seconds old, so a change
 * made on another screen (or device) shows up everywhere. `useUnits()` is
 * the hook screens use; this is its source.
 */
export const UNITS_STALE_MS = 10_000;

export function useUnitSystem(): UnitSystem {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: UNITS_STALE_MS });
  return data?.chefProfile?.preferredUnits ?? 'METRIC';
}
