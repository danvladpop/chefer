import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GymBootstrap, RoutineDoc, RoutineDto } from '@chefer/types';
import { getTranslator } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { routineWithSwap, type SlotParams } from './workout-model';

// "Swap → Today and my routine" (D5): the session swap is already applied
// locally; this pushes the same swap into the active routine. Needs a
// connection. On a version CONFLICT the swap is re-applied once on top of the
// server's current routine (it's a one-slot change, so it merges cleanly);
// if that slot no longer exists, the swap stays today-only.
//
// plan-library-supersets S2: "Also change my routine" on a workout's superset
// (or Ungroup) goes through the same path (`useRoutineEdit`) with its own
// routine builder — same conflict retry, same online-only rule.

/** The server's current routine from a CONFLICT (`error.data.conflict`), if any. */
export function readRoutineConflict(error: unknown): RoutineDto | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const data = (error as { data?: { conflict?: { kind?: string; current?: RoutineDto } | null } })
    .data;
  const conflict = data?.conflict;
  return conflict?.kind === 'routine' && conflict.current ? conflict.current : null;
}

export type RoutineSwapResult = 'saved' | 'missing' | 'failed';

/** Builds the routine save document from a base routine; null = the change no longer applies. */
export type RoutineEdit = (base: RoutineDto) => RoutineDoc | null;

/**
 * Saves a one-off edit of the cached active routine. On a version CONFLICT
 * the edit is rebuilt once on top of the server's current routine.
 */
export function useRoutineEdit(): (edit: RoutineEdit) => Promise<RoutineSwapResult> {
  const queryClient = useQueryClient();
  // The caller turns 'failed' into its own notice (ROUTINE_*_NOTICE) — no default snackbar.
  const save = trpc.gym.routine.save.useMutation({ meta: { silent: true } });
  const { mutateAsync } = save;

  return useCallback(
    async (edit) => {
      const routine =
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.activeRoutine ?? null;
      if (!routine) return 'missing';

      const attempt = async (base: RoutineDto, retry: boolean): Promise<RoutineSwapResult> => {
        const doc = edit(base);
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

export function useRoutineSwap(): (
  routineExerciseId: string,
  exerciseId: string,
  params: SlotParams,
) => Promise<RoutineSwapResult> {
  const editRoutine = useRoutineEdit();
  return useCallback(
    (routineExerciseId, exerciseId, params) =>
      editRoutine((base) => routineWithSwap(base, routineExerciseId, exerciseId, params)),
    [editRoutine],
  );
}

/** The notice for the outcome of a routine edit, in the UI language at call time. */
export function routineNotice(
  kind: 'swap' | 'superset' | 'ungroup',
  result: RoutineSwapResult,
): string {
  const key =
    `${kind}${result === 'saved' ? 'Saved' : result === 'missing' ? 'Missing' : 'Failed'}` as const;
  return getTranslator().t(`gym.workout.logger.routineNotice.${key}`);
}
