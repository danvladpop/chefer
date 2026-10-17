'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { capture } from '@/lib/analytics';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  GYM_MAX_EXERCISES_PER_SESSION,
  type ExerciseDto,
  type WorkoutSessionDoc,
  type WorkoutType,
} from '@chefer/types';
import { Button, pressControl, Sheet } from '@chefer/ui';
import { cn, workoutTypeLabel } from '@chefer/utils';
import { workoutFinishedKind } from '../analytics';
import { ExercisePickerSheet } from '../shared/exercise-picker-sheet';
import { SyncIndicator } from '../shared/sync-indicator';
import { useGymData } from '../shared/use-gym-data';
import { newId } from '../workout/ids';
import { useActiveWorkout } from '../workout/use-active-workout';
import { buildAddExerciseAction, formatElapsed, sortedExercises } from '../workout/workout-model';
import { isExerciseTicked, liveWorkoutKcal } from './simple-helpers';

// ─── "Keep it simple" live logger (simple training mode §6.2 / §6.7) ─────────
// For an active doc with a `workoutType`: the type, a running timer and
// "~kcal so far", an OPTIONAL exercise list where each row is one Done tick
// (`tickExercise` — stored as "done, load not confirmed", so progression
// ignores it, §6.5), "+ Add exercise", and Finish. One tap to start, one tap
// to finish. No sets grid, RIR, warm-ups, rest timer, plates or supersets.

export function SimpleWorkoutView({
  session,
  workoutType,
  onFinished,
}: {
  session: WorkoutSessionDoc;
  workoutType: WorkoutType;
  onFinished: (doc: WorkoutSessionDoc) => void;
}) {
  const router = useRouter();
  const { dispatch, finish, discard } = useActiveWorkout();
  const { data, lookup, today } = useGymData();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const exercises = sortedExercises(session).filter((se) => !se.skipped);
  const typeLabel = workoutTypeLabel(workoutType);
  const atCap = session.exercises.length >= GYM_MAX_EXERCISES_PER_SESSION;

  const doFinish = async () => {
    setFinishing(true);
    const finished = await finish();
    if (!finished) {
      setFinishing(false);
      return;
    }
    capture('workout_finished', {
      durationMin: Math.round(
        (Date.parse(finished.finishedAt ?? finished.startedAt) - Date.parse(finished.startedAt)) /
          60000,
      ),
      sets: 0,
      prs: 0,
      offline: typeof navigator !== 'undefined' && !navigator.onLine,
      kind: workoutFinishedKind(finished),
      workoutType,
    });
    onFinished(finished);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:py-6" data-testid="gym-simple-logger">
      <div className="sticky top-16 z-20 -mx-4 border-b bg-gray-50/95 px-4 py-2 backdrop-blur lg:top-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {session.name !== typeLabel && (
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">
                {typeLabel}
              </p>
            )}
            <h1 className="truncate font-serif text-lg font-bold text-gray-900">{session.name}</h1>
            <LiveLine session={session} bodyweightKg={data?.bodyweightKg ?? null} />
          </div>
        </div>
      </div>

      <section className="mt-5" aria-labelledby="simple-exercises-heading">
        <h2 id="simple-exercises-heading" className="text-sm font-semibold text-gray-900">
          Exercises <span className="font-normal text-gray-500">(optional)</span>
        </h2>
        {exercises.length > 0 ? (
          <ul className="mt-2 divide-y rounded-2xl border bg-white" data-testid="gym-simple-list">
            {exercises.map((se) => {
              const name = lookup(se.exerciseId)?.name ?? 'Exercise';
              const ticked = isExerciseTicked(se);
              return (
                <li key={se.id} className="flex items-center gap-1 pl-1 pr-1">
                  <label
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-1"
                    data-testid={`gym-simple-tick-${se.id}`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={ticked}
                      onChange={(e) =>
                        dispatch({ type: 'tickExercise', seId: se.id, done: e.target.checked })
                      }
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-[#944a00]/40',
                        ticked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300',
                      )}
                    >
                      {ticked && <Check className="h-4 w-4" />}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 truncate text-sm',
                        ticked ? 'text-gray-500' : 'text-gray-900',
                      )}
                    >
                      {name}
                    </span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => dispatch({ type: 'removeExercise', seId: se.id })}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600',
                      pressControl,
                    )}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Add exercises if you like and tick them off. Or just finish when you&apos;re done.
          </p>
        )}
        <Button
          variant="outline"
          className="mt-3 min-h-11 w-full"
          onClick={() => setPickerOpen(true)}
          disabled={!data?.profile || atCap}
          data-testid="gym-simple-add-exercise"
        >
          <Plus aria-hidden="true" />
          Add exercise
        </Button>
      </section>

      <div className="mt-8 flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full bg-[#944a00] hover:bg-[#7a3d00]"
          onClick={() => void doFinish()}
          loading={finishing}
          data-testid="gym-finish"
        >
          Finish workout
        </Button>
        <Button
          variant="ghost"
          className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setConfirmDiscard(true)}
        >
          Discard
        </Button>
        <SyncIndicator />
      </div>

      {data && (
        <ExercisePickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          library={data.library}
          title="Add an exercise"
          preferSwapGroup={null}
          onPick={(exercise: ExerciseDto) => {
            dispatch(
              buildAddExerciseAction({
                doc: session,
                meta: exercise,
                bootstrap: data,
                lookup,
                today,
                newId,
              }),
            );
            setPickerOpen(false);
          }}
        />
      )}

      <Sheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this workout?"
        description="It won't be saved to your history."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                discard();
                setConfirmDiscard(false);
                router.replace('/gym');
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <div />
      </Sheet>
    </div>
  );
}

/** "32:10 · ~190 kcal so far" — ticks every second in its own component. */
function LiveLine({
  session,
  bodyweightKg,
}: {
  session: WorkoutSessionDoc;
  bodyweightKg: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const kcal = liveWorkoutKcal(session, new Date(now).toISOString(), bodyweightKg);
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-gray-500">
      <span className="tabular-nums" data-testid="gym-simple-elapsed">
        {formatElapsed(session.startedAt, now)}
      </span>
      {kcal !== null && <span data-testid="gym-simple-kcal">~{kcal} kcal so far</span>}
    </p>
  );
}
