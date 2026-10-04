// "Fill from one of my routines" (spec §2.5): copy the trainer's own routine into
// the client's draft, in the browser. Only Chefer's exercises can be added to a
// client's routine, so the trainer's custom exercises are left out; new rows carry
// no ids (the server assigns them on the normal save) and no notes.
import type { RoutineDto } from '@chefer/types';
import { normalizeSupersets } from '@chefer/utils';
import { makeKey, type DraftRoutine } from '../gym/routine/draft';

export interface FillResult {
  draft: DraftRoutine;
  /** Exercises left out because they are not in Chefer's library. */
  skipped: number;
}

export function draftFromOwnRoutine(
  own: RoutineDto,
  current: Pick<DraftRoutine, 'id' | 'name'>,
  curatedIds: ReadonlySet<string>,
): FillResult {
  let skipped = 0;
  const days = own.days
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((day) => ({
      key: makeKey('day'),
      name: day.name,
      plannedWeekday: day.plannedWeekday,
      exercises: normalizeSupersets(
        day.exercises
          .slice()
          .sort((a, b) => a.position - b.position)
          .filter((exercise) => {
            const keep = curatedIds.has(exercise.exerciseId);
            if (!keep) skipped += 1;
            return keep;
          })
          .map((exercise) => ({
            key: makeKey('ex'),
            exerciseId: exercise.exerciseId,
            sets: exercise.sets,
            repMin: exercise.repMin,
            repMax: exercise.repMax,
            targetRir: exercise.targetRir,
            restSec: exercise.restSec,
            supersetGroup: exercise.supersetGroup,
            notes: null,
            trainerNote: null,
          })),
      ),
    }));
  return { draft: { id: current.id, name: current.name, days }, skipped };
}
