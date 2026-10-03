'use client';

import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import type { RoutineDoc, RoutineDto } from '@chefer/types';
import { captureGymEvent } from '../analytics';
import { showGymToast } from '../shared/gym-toast';

/** The server's current routine from a `gym.routine.save` CONFLICT (else null). */
function conflictCurrent(error: unknown): RoutineDto | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const { data } = error as { data?: { conflict?: { current?: RoutineDto } | null } };
  return data?.conflict?.current ?? null;
}

/**
 * "Also change my routine" from the workout (plan-library-supersets S-D2):
 * saves `build(routine)` through `gym.routine.save` against the cached
 * routine's version. On a version CONFLICT (the routine was edited elsewhere)
 * the same change is rebuilt on the server's current copy and saved once
 * more; if it no longer applies, the workout keeps its change and a toast
 * says the routine was left alone.
 */
export function useRoutineSupersetSave(): (
  routine: RoutineDto,
  build: (routine: RoutineDto) => RoutineDoc | null,
) => Promise<boolean> {
  const utils = trpc.useUtils();
  const { mutateAsync } = trpc.gym.routine.save.useMutation({ meta: { silent: true } });

  return useCallback(
    async (routine, build) => {
      const fail = () => {
        showGymToast({
          message: "Couldn't change your routine. This workout keeps the change.",
          type: 'error',
        });
        return false;
      };
      const doc = build(routine);
      if (!doc) return fail();
      let savedId: string;
      try {
        savedId = (await mutateAsync({ routine: doc, expectedVersion: routine.version })).id;
      } catch (error) {
        const current = conflictCurrent(error);
        const retry = current ? build(current) : null;
        if (!current || !retry) return fail();
        try {
          savedId = (await mutateAsync({ routine: retry, expectedVersion: current.version })).id;
        } catch {
          return fail();
        }
      }
      captureGymEvent('routine_edited', { kind: 'superset_from_workout' });
      void utils.gym.bootstrap.invalidate();
      void utils.gym.routine.list.invalidate();
      void utils.gym.routine.get.invalidate({ id: savedId });
      return true;
    },
    [mutateAsync, utils],
  );
}
