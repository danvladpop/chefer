import { trpc } from '@/lib/trpc';
import type { WeightUnit } from '@chefer/types';

/**
 * The unit weights are shown in on the trainer's screens: the trainer's own gym
 * setting, kilograms when there is none. The client's profile is never shared.
 */
export function useTrainerUnit(): WeightUnit {
  const { data } = trpc.gym.profile.get.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60_000,
  });
  return data?.unit ?? 'KG';
}
