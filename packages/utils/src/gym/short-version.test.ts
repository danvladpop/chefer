// T-36.6 (UX-36 (6), AC7): shortVersion trims a day to the time available.
import { describe, expect, it } from 'vitest';
import {
  PROGRAM_TEMPLATES,
  type NextWorkoutDto,
  type NextWorkoutExerciseDto,
  type Suggestion,
} from '@chefer/types';
import { estimateMinutes } from './duration';
import {
  SHORT_VERSION_TOLERANCE_MIN,
  shortVersion,
  shortVersionOfWorkout,
  type ShortVersionExercise,
} from './short-version';
import { instantiateTemplate } from './templates';
import { lookup } from './test-fixtures';
import { startSession, workoutReducer } from './workout-reducer';

const row = (
  exerciseId: string,
  muscle: string,
  isCompound: boolean,
  sets = 3,
  restSec = isCompound ? 150 : 75,
): ShortVersionExercise => ({ exerciseId, muscle, isCompound, sets, restSec });

// A typical push day: 2 compounds + 5 accessories over 3 muscles.
const PUSH_DAY: ShortVersionExercise[] = [
  row('bench', 'chest', true, 4),
  row('ohp', 'shoulders', true, 3),
  row('incline-db', 'chest', false),
  row('fly', 'chest', false),
  row('lateral-raise', 'shoulders', false),
  row('pushdown', 'triceps', false),
  row('overhead-ext', 'triceps', false),
];

describe('shortVersion', () => {
  it('cuts nothing when the day already fits the time (full path unchanged)', () => {
    const full = estimateMinutes(PUSH_DAY);
    const result = shortVersion(PUSH_DAY, full);
    expect(result.dropped).toEqual([]);
    expect(result.kept).toEqual(PUSH_DAY);
    expect(result.minutes).toBe(full);
    expect(result.exerciseCount).toBe(PUSH_DAY.length);
  });

  it('keeps every compound and the first accessory per muscle, drops the rest', () => {
    // 45 min leaves room for step 2 alone (compounds + first accessory per muscle).
    const result = shortVersion(PUSH_DAY, 45);
    expect(result.kept.map((e) => e.exerciseId)).toEqual([
      'bench',
      'ohp',
      'incline-db',
      'lateral-raise',
      'pushdown',
    ]);
    expect(result.dropped.map((e) => e.exerciseId)).toEqual(['fly', 'overhead-ext']);
    expect(result.exerciseCount).toBe(5);
  });

  it('yields at most 32 minutes for a 30-minute budget (AC7)', () => {
    const result = shortVersion(PUSH_DAY, 30);
    expect(result.minutes).toBeLessThanOrEqual(30 + SHORT_VERSION_TOLERANCE_MIN);
    expect(result.minutes).toBe(estimateMinutes(result.kept));
    expect(result.kept.length).toBeGreaterThanOrEqual(1);
    // Compounds outlive accessories when trimming further.
    expect(result.kept.some((e) => e.isCompound)).toBe(true);
    // Nothing is lost: kept + dropped is the whole day.
    expect(result.kept.length + result.dropped.length).toBe(PUSH_DAY.length);
  });

  it('never returns an empty session, even for an impossible budget', () => {
    const result = shortVersion(PUSH_DAY, 5);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.isCompound).toBe(true);
  });

  it('keeps original order and reports the kept indices', () => {
    const result = shortVersion(PUSH_DAY, 30);
    expect(result.keptIndices).toEqual([...result.keptIndices].sort((a, b) => a - b));
    expect(result.keptIndices.map((i) => PUSH_DAY[i])).toEqual(result.kept);
  });

  it('fits 30 minutes (≤ 32) for every FULL_GYM program template day', () => {
    for (const template of PROGRAM_TEMPLATES) {
      const draft = instantiateTemplate(template.key, 'FULL_GYM', lookup);
      for (const day of draft.days) {
        const rows = day.exercises.map((e): ShortVersionExercise => {
          const meta = lookup(e.exerciseId);
          return {
            exerciseId: e.exerciseId,
            muscle: meta?.primaryMuscles[0] ?? e.exerciseId,
            isCompound: meta?.category === 'COMPOUND',
            sets: e.sets,
            restSec: e.restSec,
          };
        });
        if (rows.length === 0) continue;
        const result = shortVersion(rows, 30);
        // A single compound can be longer than the budget on its own; otherwise ≤ 32.
        if (result.kept.length > 1) {
          expect(result.minutes, `${template.key} · ${day.name}`).toBeLessThanOrEqual(32);
        }
      }
    }
  });
});

// ─── shortVersionOfWorkout (the NextWorkoutDto adapter) ────────────────────────

const SUGGESTION: Suggestion = {
  kind: 'start',
  weightKg: 40,
  reps: [8, 8, 8],
  sets: 3,
  reasonCode: 'START',
  inputs: {},
  deltaKg: 0,
  engineVersion: 3,
};

function nextEx(
  exerciseId: string,
  position: number,
  extra: Partial<NextWorkoutExerciseDto> = {},
): NextWorkoutExerciseDto {
  const meta = lookup(exerciseId);
  return {
    routineExerciseId: `re-${exerciseId}`,
    exerciseId,
    position,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: meta?.restSec ?? 90,
    supersetGroup: null,
    notes: null,
    repBucket: '8-12',
    suggestion: SUGGESTION,
    warmups: [],
    lastTime: null,
    ...extra,
  };
}

function workoutOf(exercises: NextWorkoutExerciseDto[]): NextWorkoutDto {
  const rows = exercises.map((e) => ({
    sets: e.sets,
    restSec: e.restSec,
    isCompound: lookup(e.exerciseId)?.category === 'COMPOUND',
  }));
  return {
    routineId: 'r1',
    dayId: 'dA',
    dayName: 'Push',
    isDeload: false,
    estimatedMin: estimateMinutes(rows),
    exercises,
  };
}

describe('shortVersionOfWorkout', () => {
  const day = () =>
    workoutOf([
      nextEx('barbell-bench-press', 0),
      nextEx('overhead-press', 1),
      nextEx('incline-dumbbell-press', 2),
      nextEx('cable-fly', 3),
      nextEx('dumbbell-lateral-raise', 4),
      nextEx('triceps-pushdown', 5),
    ]);

  it('returns the workout untouched for Full (null) and for a budget it already fits', () => {
    const w = day();
    expect(shortVersionOfWorkout(w, lookup, null)).toMatchObject({
      workout: w,
      carryOverExerciseIds: [],
      isShort: false,
    });
    expect(shortVersionOfWorkout(w, lookup, 240).workout).toBe(w);
  });

  it('drops exercises into carryOverExerciseIds and renumbers positions', () => {
    const w = day();
    const result = shortVersionOfWorkout(w, lookup, 30);
    expect(result.isShort).toBe(true);
    expect(result.workout.estimatedMin).toBeLessThanOrEqual(32);
    expect(result.workout.exercises.map((e) => e.position)).toEqual(
      result.workout.exercises.map((_, i) => i),
    );
    const keptIds = result.workout.exercises.map((e) => e.exerciseId);
    expect([...keptIds, ...result.carryOverExerciseIds].sort()).toEqual(
      w.exercises.map((e) => e.exerciseId).sort(),
    );
    expect(result.exerciseCount).toBe(keptIds.length);
    expect(result.minutes).toBe(result.workout.estimatedMin);
  });

  it('does not re-carry exercises that are already `From last time`', () => {
    const w = workoutOf([
      nextEx('barbell-bench-press', 0),
      nextEx('dumbbell-lateral-raise', 1, { fromLastTime: true }),
      nextEx('cable-fly', 2),
      nextEx('triceps-pushdown', 3),
      nextEx('overhead-press', 4),
    ]);
    const result = shortVersionOfWorkout(w, lookup, 20);
    expect(result.isShort).toBe(true);
    expect(result.carryOverExerciseIds).not.toContain('dumbbell-lateral-raise');
  });

  it('un-groups a superset whose partner was dropped', () => {
    const w = workoutOf([
      nextEx('barbell-bench-press', 0),
      nextEx('overhead-press', 1),
      nextEx('dumbbell-lateral-raise', 2, { supersetGroup: 'A' }),
      nextEx('triceps-pushdown', 3, { supersetGroup: 'A' }),
      nextEx('cable-fly', 4),
    ]);
    const result = shortVersionOfWorkout(w, lookup, 20);
    for (const ex of result.workout.exercises) {
      if (ex.supersetGroup) {
        const partners = result.workout.exercises.filter(
          (e) => e.supersetGroup === ex.supersetGroup,
        );
        expect(partners.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// ─── The dropped exercises carry over at Finish ────────────────────────────────

describe('short version → session doc → carry-over', () => {
  it('seeds carryOverExerciseIds at start and keeps them through finish', () => {
    let n = 0;
    const newId = () => `id-${String((n += 1))}`;
    const doc = startSession({
      id: 's1',
      newId,
      now: '2026-09-29T10:00:00.000Z',
      localDate: '2026-09-29',
      routineId: 'r1',
      routineDayId: 'dA',
      name: 'Push',
      isDeload: false,
      exercises: [nextEx('barbell-bench-press', 0)],
      carryOverExerciseIds: ['cable-fly', 'lateral-raise'],
    });
    expect(doc.carryOverExerciseIds).toEqual(['cable-fly', 'lateral-raise']);

    const finished = workoutReducer(doc, { type: 'finish', at: '2026-09-29T10:30:00.000Z' });
    expect(finished.carryOverExerciseIds).toEqual(['cable-fly', 'lateral-raise']);

    // Ids chosen at Finish add to the seeded ones without duplicating.
    const both = workoutReducer(doc, {
      type: 'finish',
      at: '2026-09-29T10:30:00.000Z',
      carryOverExerciseIds: ['barbell-bench-press', 'cable-fly'],
    });
    expect(both.carryOverExerciseIds).toEqual([
      'cable-fly',
      'lateral-raise',
      'barbell-bench-press',
    ]);
  });

  it('a full-length start has no carryOverExerciseIds (old behaviour)', () => {
    const doc = startSession({
      id: 's1',
      newId: (() => {
        let n = 0;
        return () => `id-${String((n += 1))}`;
      })(),
      now: '2026-09-29T10:00:00.000Z',
      localDate: '2026-09-29',
      routineId: 'r1',
      routineDayId: 'dA',
      name: 'Push',
      isDeload: false,
      exercises: [nextEx('barbell-bench-press', 0)],
    });
    expect('carryOverExerciseIds' in doc).toBe(false);
    const finished = workoutReducer(doc, { type: 'finish', at: '2026-09-29T10:30:00.000Z' });
    expect('carryOverExerciseIds' in finished).toBe(false);
  });
});
