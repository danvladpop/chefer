import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EquipmentProfile, ExerciseDto, GymBootstrap } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { addsUnsuggestedLoad } from './workout-model';

// Owner dogfood 2026-09-30: pull-ups, chin-ups and dips can always log added
// weight, but the engine only SUGGESTS added weight once the dip-belt setting
// is on. The first time someone logs extra kg without it, offer to turn it on
// — never flip the setting silently. Asked at most once per screen.

export function useWeightedBodyweightOffer(): (
  meta: ExerciseDto,
  profile: EquipmentProfile,
  kg: number,
) => void {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const asked = useRef(false);
  const save = trpc.gym.profile.save.useMutation({
    onSuccess: (profile) => {
      queryClient.setQueryData(gymBootstrapQueryKey, (prev: GymBootstrap | undefined) =>
        prev ? { ...prev, profile } : prev,
      );
      snackbar.show({ message: 'Weighted sets on — change it in Gym settings.', tone: 'success' });
    },
  });
  const mutate = save.mutate;

  return useCallback(
    (meta, profile, kg) => {
      if (asked.current || !addsUnsuggestedLoad(meta, profile, kg)) return;
      asked.current = true;
      snackbar.show({
        message: `Added weight on ${meta.name}. Suggest weighted sets next time?`,
        actionLabel: 'Yes',
        durationMs: 8000,
        onAction: () => mutate({ hasDipBelt: true }),
      });
    },
    [mutate, snackbar],
  );
}
