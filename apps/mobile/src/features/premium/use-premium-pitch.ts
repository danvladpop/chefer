import { premiumPitchFor, type PremiumPitch } from '@chefer/utils';
import { useFlags } from '../../hooks/use-flags';
import { trpc } from '../../lib/trpc';

/**
 * The pitch for `source`, filled from what the app already knows about this
 * user: their jobs (a Train user gets the gym-first default), the flags (a bullet
 * retires once its promise is free) and their table (household copy). Every
 * value is optional — while a query loads, the registry's generic wording
 * shows, never a blank.
 */
export function usePremiumPitch(source: string | null, enabled = true): PremiumPitch {
  const flags = useFlags();
  const prefs = trpc.preferences.get.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const household = trpc.household.list.useQuery(undefined, {
    enabled: enabled && (source === 'household' || source === null),
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
