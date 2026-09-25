import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXERCISE_BY_ID,
  workoutSessionDocSchema,
  type ExerciseMeta,
  type GymBootstrap,
  type GymProfileDto,
  type NextWorkoutDto,
  type SessionSummaryDto,
} from '@chefer/types';
import { stepUp, warmupSets } from '@chefer/utils';
import { activeSessionStore } from './active-session-store';
import { newId } from './ids';
import { outbox } from './outbox';
import { resetGymOwnerForTests, setGymOwner } from './owner';
import { getRestTimer, resetRestTimerForTests } from './rest-timer';
import { createMemoryStorage, GYM_KEYS, setStorageForTests, type KvStorage } from './storage';
import {
  discardWorkout,
  dispatchWorkout,
  finishWorkout,
  getResumableSession,
  readLastFinished,
  reconcileActiveSession,
  startWorkout,
} from './use-active-workout';
import {
  buildAddExerciseAction,
  buildSwapAction,
  currentExerciseId,
  currentFocus,
  lastNoteFor,
  lastTimeSets,
  livePrs,
  loadSlotOf,
  prescriptionFor,
  sessionProgress,
  setLabelOf,
  supersetsOf,
  unfinishedSets,
  workingSets,
} from './workout-model';

const TODAY = '2026-09-24';

const PROFILE: GymProfileDto = {
  experience: 'BEGINNER',
  equipmentAccess: 'FULL_GYM',
  unit: 'KG',
  weeklyGoal: 3,
  barWeightKg: 20,
  platePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellsKg: [10, 12, 14, 16, 18, 20, 22.5, 25],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
  reminderEnabled: false,
  reminderTime: null,
  setupCompletedAt: '2026-09-01T10:00:00.000Z',
};

const bootstrap: Pick<GymBootstrap, 'profile' | 'progressions'> = {
  profile: PROFILE,
  progressions: [],
};

const lookup = (id: string): ExerciseMeta | undefined => EXERCISE_BY_ID.get(id);
const meta = (id: string): ExerciseMeta => {
  const m = lookup(id);
  if (!m) throw new Error(`unknown exercise ${id}`);
  return m;
};

function plannedWorkout(groups: (string | null)[] = []): NextWorkoutDto {
  const exercises = ['barbell-bench-press', 'back-squat'].map((id, position) => {
    const p = prescriptionFor({
      meta: meta(id),
      bootstrap,
      today: TODAY,
      sets: 3,
      repMin: 8,
      repMax: 12,
      isFirstForPattern: true,
    });
    return {
      routineExerciseId: `re-${position}`,
      exerciseId: id,
      position,
      sets: p.prescription.sets,
      repMin: p.repMin,
      repMax: p.repMax,
      targetRir: p.targetRir,
      restSec: p.restSec,
      supersetGroup: groups[position] ?? null,
      notes: null,
      repBucket: '8-12',
      suggestion: p.prescription,
      warmups: p.warmups,
      lastTime: null,
    };
  });
  return {
    routineId: 'routine-1',
    dayId: 'day-a',
    dayName: 'Full Body A',
    isDeload: false,
    estimatedMin: 50,
    exercises,
  };
}

let storage: KvStorage;

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
  activeSessionStore.reload();
  outbox.reload();
  outbox.configure(null); // no sender: enqueue keeps entries, flush is a no-op
  resetRestTimerForTests();
  resetGymOwnerForTests();
  setGymOwner('user-a');
});

afterEach(() => {
  setStorageForTests(null);
});

describe('workout page wiring (reducer + persistence)', () => {
  it('starts a planned session with prefilled warm-ups and working sets, persisted at once', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.name).toBe('Full Body A');
    expect(doc.routineDayId).toBe('day-a');
    const bench = doc.exercises[0]!;
    expect(workingSets(bench)).toHaveLength(bench.prescription.sets);
    expect(workingSets(bench).every((s) => s.weightKg === bench.prescription.weightKg)).toBe(true);

    const stored: unknown = JSON.parse(storage.getItem(GYM_KEYS.activeSession)!);
    expect(stored).toMatchObject({ v: 1, ownerId: 'user-a', doc: { id: doc.id } });
  });

  it('never overwrites a running session when starting again', () => {
    const first = startWorkout({ kind: 'freestyle' }, TODAY);
    const second = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    expect(second.id).toBe(first.id);
  });

  it('ticks a working set in one action, persists it, and starts the rest timer', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    const set = workingSets(bench)[0]!;
    const next = dispatchWorkout({ type: 'completeSet', seId: bench.id, setId: set.id });

    expect(next?.exercises[0]?.sets.find((s) => s.id === set.id)?.completedAt).not.toBeNull();
    expect(sessionProgress(next!).done).toBe(1);
    expect(getRestTimer()).toMatchObject({ seId: bench.id, durationSec: bench.restSec });

    // A reload (fresh store over the same storage) resumes exactly here.
    activeSessionStore.reload();
    expect(sessionProgress(getResumableSession()!).done).toBe(1);
  });

  it('does not start a rest after a warm-up', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const withWarmups = doc.exercises.find((se) => se.sets.some((s) => s.isWarmup));
    const warm = withWarmups?.sets.find((s) => s.isWarmup);
    if (!withWarmups || !warm) return; // engine produced no warm-ups for this load
    dispatchWorkout({ type: 'completeSet', seId: withWarmups.id, setId: warm.id });
    expect(getRestTimer()).toBeNull();
  });

  it('edits a set with an achievable step and keeps it ticked', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    const set = workingSets(bench)[0]!;
    dispatchWorkout({ type: 'completeSet', seId: bench.id, setId: set.id });
    const up = stepUp(set.weightKg, loadSlotOf(meta('barbell-bench-press')), {
      ...PROFILE,
    });
    const next = dispatchWorkout({ type: 'editSet', seId: bench.id, setId: set.id, weightKg: up });
    const edited = next!.exercises[0]!.sets.find((s) => s.id === set.id)!;
    expect(edited.weightKg).toBe(up);
    expect(edited.completedAt).not.toBeNull();
  });

  it('moves the focus to the next exercise once every working set is ticked', () => {
    let doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const [bench, squat] = doc.exercises;
    expect(currentExerciseId(doc)).toBe(bench!.id);
    for (const s of workingSets(bench!)) {
      doc = dispatchWorkout({ type: 'completeSet', seId: bench!.id, setId: s.id })!;
    }
    expect(currentExerciseId(doc)).toBe(squat!.id);
    doc = dispatchWorkout({ type: 'skipExercise', seId: squat!.id, skipped: true })!;
    expect(unfinishedSets(doc)).toBe(0);
  });

  it('swaps and adds exercises with engine prescriptions that pass the sync schema', () => {
    let doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    const swap = buildSwapAction({
      doc,
      seId: bench.id,
      meta: meta('dumbbell-bench-press'),
      bootstrap,
      lookup,
      today: TODAY,
      newId,
    });
    doc = dispatchWorkout(swap!)!;
    expect(doc.exercises[0]).toMatchObject({
      exerciseId: 'dumbbell-bench-press',
      swappedFromId: 'barbell-bench-press',
      repMin: 8,
      repMax: 12,
    });

    const add = buildAddExerciseAction({
      doc,
      meta: meta('front-squat'),
      bootstrap,
      lookup,
      today: TODAY,
      newId,
    });
    doc = dispatchWorkout(add)!;
    expect(doc.exercises).toHaveLength(3);
    expect(workingSets(doc.exercises[2]!)).toHaveLength(3);
    // The second squat pattern of the session gets no full warm-up ramp.
    expect(doc.exercises[2]!.sets.filter((s) => s.isWarmup).length).toBeLessThanOrEqual(1);
    expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
  });

  it('finish hands the doc to the outbox first, then clears the session and timer', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    dispatchWorkout({ type: 'completeSet', seId: bench.id, setId: workingSets(bench)[0]!.id });

    const finished = finishWorkout();
    expect(finished?.status).toBe('COMPLETED');
    expect(outbox.getState().entries.map((e) => [e.doc.id, e.ownerId, e.doc.status])).toEqual([
      [doc.id, 'user-a', 'COMPLETED'],
    ]);
    expect(getResumableSession()).toBeNull();
    expect(storage.getItem(GYM_KEYS.activeSession)).toBeNull();
    expect(getRestTimer()).toBeNull();
    expect(readLastFinished(doc.id, 'user-a')?.id).toBe(doc.id);
    expect(readLastFinished(doc.id, 'user-b')).toBeNull();
  });

  it('discard still goes through the outbox as DISCARDED', () => {
    const doc = startWorkout({ kind: 'freestyle' }, TODAY);
    discardWorkout();
    expect(outbox.getState().entries[0]?.doc).toMatchObject({ id: doc.id, status: 'DISCARDED' });
    expect(getResumableSession()).toBeNull();
  });

  it("hands another account's running session to the outbox under its owner", () => {
    const doc = startWorkout({ kind: 'freestyle' }, TODAY);
    setGymOwner('user-b');
    expect(getResumableSession()).toBeNull(); // user B never sees A's workout
    reconcileActiveSession('user-b');
    expect(outbox.getState().entries[0]).toMatchObject({ ownerId: 'user-a', doc: { id: doc.id } });
    expect(activeSessionStore.get()).toBeNull();
  });

  it('reconcile drops a stale active copy whose finished doc is already queued', () => {
    const doc = startWorkout({ kind: 'freestyle' }, TODAY);
    const record = activeSessionStore.get()!;
    finishWorkout();
    // Simulate a crash between enqueue and clear: the active copy is back.
    activeSessionStore.set(record.doc, record.ownerId);
    reconcileActiveSession('user-a');
    expect(activeSessionStore.get()).toBeNull();
    expect(outbox.getState().entries[0]?.doc.id).toBe(doc.id);
  });
});

describe('workout view model', () => {
  const history: SessionSummaryDto[] = [
    {
      id: 'old-1',
      name: 'Full Body A',
      routineDayId: 'day-a',
      status: 'COMPLETED',
      localDate: '2026-09-20',
      startedAt: '2026-09-20T09:00:00.000Z',
      finishedAt: '2026-09-20T10:00:00.000Z',
      isDeload: false,
      exercises: [
        {
          exerciseId: 'barbell-bench-press',
          skipped: false,
          lastSetRir: 2,
          sets: [
            { weightKg: 40, reps: 10, isWarmup: false, completed: true },
            { weightKg: 40, reps: 9, isWarmup: false, completed: true },
          ],
        },
      ],
    },
  ];

  it('shows last time from the newest completed session', () => {
    expect(lastTimeSets('barbell-bench-press', history)).toEqual([
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 9 },
    ]);
    expect(lastTimeSets('back-squat', history)).toEqual([]);
  });

  it('surfaces the most recent non-empty note for an exercise', () => {
    const withNotes: SessionSummaryDto[] = [
      {
        ...history[0]!,
        id: 'old-2',
        localDate: '2026-09-13',
        exercises: [{ ...history[0]!.exercises[0]!, notes: 'stale note' }],
      },
      {
        ...history[0]!,
        id: 'new-1',
        localDate: '2026-09-22',
        exercises: [{ ...history[0]!.exercises[0]!, notes: 'seat 4, grip wide' }],
      },
    ];
    expect(lastNoteFor('barbell-bench-press', withNotes)).toBe('seat 4, grip wide');
    expect(lastNoteFor('back-squat', withNotes)).toBeNull();
  });

  it('shows at most one live PR per exercise, on the best set', () => {
    let doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    const [s1, s2] = workingSets(bench);
    doc = dispatchWorkout({
      type: 'editSet',
      seId: bench.id,
      setId: s1!.id,
      weightKg: 42.5,
      reps: 10,
    })!;
    doc = dispatchWorkout({ type: 'completeSet', seId: bench.id, setId: s1!.id })!;
    doc = dispatchWorkout({
      type: 'editSet',
      seId: bench.id,
      setId: s2!.id,
      weightKg: 45,
      reps: 8,
    })!;
    doc = dispatchWorkout({ type: 'completeSet', seId: bench.id, setId: s2!.id })!;

    const prs = livePrs(doc, history);
    expect(prs.size).toBe(1);
    expect(prs.get(bench.id)?.setId).toBe(s1!.id); // e1RM beats weight; first wins the tie
    expect(prs.get(bench.id)?.kind).toBe('e1rm');
  });

  it('warm-up ramps come from the engine (collapsed in the UI)', () => {
    const slot = {
      ...loadSlotOf(meta('back-squat')),
      sets: 3,
      repMin: 5,
      repMax: 8,
      targetRir: 2,
      restSec: 180,
    };
    const w = warmupSets({
      slot: { ...slot, exercise: meta('back-squat') },
      workingKg: 100,
      isFirstForPattern: true,
      profile: { ...PROFILE },
    });
    expect(w.length).toBeGreaterThan(1);
  });
});

describe('supersets (rest after the round, auto-advance)', () => {
  it('A1 → A2 with no rest; the rest starts after the last exercise of the round', () => {
    const planned = plannedWorkout(['A', 'A']);
    let doc = startWorkout({ kind: 'planned', workout: planned }, TODAY);
    const supersets = supersetsOf(doc, { activeRoutine: null, nextWorkout: planned });
    const [a1, a2] = doc.exercises;
    expect(supersets.get(a1!.id)).toMatchObject({ label: 'A', index: 0, size: 2 });

    const a1Set1 = workingSets(a1!)[0]!;
    doc = dispatchWorkout({ type: 'completeSet', seId: a1!.id, setId: a1Set1.id }, { supersets })!;
    expect(getRestTimer()).toBeNull();
    expect(currentFocus(doc, supersets)).toEqual({
      seId: a2!.id,
      setId: workingSets(a2!)[0]!.id,
    });
    expect(currentExerciseId(doc, supersets)).toBe(a2!.id);

    doc = dispatchWorkout(
      { type: 'completeSet', seId: a2!.id, setId: workingSets(a2!)[0]!.id },
      { supersets },
    )!;
    expect(getRestTimer()).toMatchObject({ seId: a2!.id, durationSec: a2!.restSec });
    expect(currentFocus(doc, supersets)?.setId).toBe(workingSets(a1!)[1]!.id);

    // Round 2 while resting: the rest clears, focus goes to A2 set 2.
    doc = dispatchWorkout(
      { type: 'completeSet', seId: a1!.id, setId: workingSets(a1!)[1]!.id },
      { supersets },
    )!;
    expect(getRestTimer()).toBeNull();
    expect(currentFocus(doc, supersets)?.seId).toBe(a2!.id);
  });

  it('no grouping without a routine letter: every working set rests', () => {
    const doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const supersets = supersetsOf(doc, { activeRoutine: null, nextWorkout: plannedWorkout() });
    expect(supersets.size).toBe(0);
    const bench = doc.exercises[0]!;
    dispatchWorkout(
      { type: 'completeSet', seId: bench.id, setId: workingSets(bench)[0]!.id },
      { supersets },
    );
    expect(getRestTimer()).toMatchObject({ seId: bench.id });
  });
});

describe('removing a specific set', () => {
  it('removes a working or warm-up set and keeps positions contiguous', () => {
    let doc = startWorkout({ kind: 'planned', workout: plannedWorkout() }, TODAY);
    const bench = doc.exercises[0]!;
    const second = workingSets(bench)[1]!;
    expect(setLabelOf(bench, second.id)).toBe('Set 2');
    doc = dispatchWorkout({ type: 'removeSet', seId: bench.id, setId: second.id })!;
    const after = doc.exercises[0]!;
    expect(after.sets.some((s) => s.id === second.id)).toBe(false);
    expect(after.sets.map((s) => s.position)).toEqual(after.sets.map((_, i) => i));

    const warm = after.sets.find((s) => s.isWarmup);
    if (!warm) return; // engine produced no warm-ups for this load
    expect(setLabelOf(after, warm.id)).toBe('Warm-up 1');
    doc = dispatchWorkout({ type: 'removeSet', seId: bench.id, setId: warm.id })!;
    const final = doc.exercises[0]!;
    expect(final.sets).toHaveLength(after.sets.length - 1);
    expect(final.sets.map((s) => s.position)).toEqual(final.sets.map((_, i) => i));
    expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
  });
});
