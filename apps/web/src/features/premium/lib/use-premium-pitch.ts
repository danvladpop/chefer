'use client';

import { useFlags } from '@/features/flags/use-flags';
import { trpc } from '@/lib/trpc';
import { premiumPitchFor, type PremiumPitch } from '@chefer/utils';

/**
 * The pitch for `source`, filled from what the app already knows about this
 * user (web twin of apps/mobile `usePremiumPitch`): their jobs — a Train user
 * gets the gym-first default —, the flags (a bullet retires once its promise
 * is free) and their table. Every value is optional: while a query loads the
 * registry's generic wording shows, never a blank.
 */
export function usePremiumPitch(source: string, enabled = true): PremiumPitch {
  const flags = useFlags();
  const prefs = trpc.preferences.get.useQuery(undefined, { enabled, staleTime: 60_000 });
  const household = trpc.household.list.useQuery(undefined, {
    enabled: enabled && source === 'household',
    staleTime: 60_000,
  });
  const members = household.data ?? [];
  const kid = members.find((m) => m.isKid);

  return premiumPitchFor(source, {
    jobs: prefs.data?.jobs ?? [],
    flags,
    context: {
      tableSize: members.length > 0 ? members.length + 1 : undefined,
      kidName: kid?.name,
    },
  });
}
