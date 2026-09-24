import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GymBootstrap, RoutineDto } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { routineWithSwap, type SlotParams } from './workout-model';

// "Swap → Today and my routine" (D5): the session swap is already applied
// locally; this pushes the same swap into the active routine. Needs a
// connection. On a version CONFLICT the swap is re-applied once on top of the
// server's current routine (it's a one-slot change, so it merges cleanly);
// if that slot no longer exists, the swap stays today-only.

/** The server's current routine from a CONFLICT (`error.data.conflict`), if any. */
export function readRoutineConflict(error: unknown): RoutineDto | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const data = (error as { data?: { conflict?: { kind?: string; current?: RoutineDto } | null } })
    .data;
  const conflict = data?.conflict;
  return conflict?.kind === 'routine' && conflict.current ? conflict.current : null;
}

export type RoutineSwapResult = 'saved' | 'missing' | 'failed';

export function useRoutineSwap(): (
  routineExerciseId: string,
  exerciseId: string,
  params: SlotParams,
) => Promise<RoutineSwapResult> {
  const queryClient = useQueryClient();
  const save = trpc.gym.routine.save.useMutation();
  const { mutateAsync } = save;

  return useCallback(
    async (routineExerciseId, exerciseId, params) => {
      const routine =
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.activeRoutine ?? null;
      if (!routine) return 'missing';

      const attempt = async (base: RoutineDto, retry: boolean): Promise<RoutineSwapResult> => {
        const doc = routineWithSwap(base, routineExerciseId, exerciseId, params);
        if (!doc) return 'missing';
        try {
          const saved = await mutateAsync({ routine: doc, expectedVersion: base.version });
          queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (old) =>
            old ? { ...old, activeRoutine: saved } : old,
          );
          void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
          return 'saved';
        } catch (error) {
          const current = readRoutineConflict(error);
          if (current && retry) return attempt(current, false);
          return 'failed';
        }
      };
      return attempt(routine, true);
    },
    [mutateAsync, queryClient],
  );
}

export const ROUTINE_SWAP_NOTICE: Record<RoutineSwapResult, string> = {
  saved: 'Routine updated. Next time you’ll get this exercise too.',
  missing: 'That exercise is no longer in your routine, so the swap applies to today only.',
  failed: 'Couldn’t update your routine. The swap still applies today.',
};
