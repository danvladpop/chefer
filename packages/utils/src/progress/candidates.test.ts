import { describe, expect, it } from 'vitest';
import {
  candidateKey,
  candidateXp,
  cookCandidate,
  dayCandidates,
  fullDayCandidate,
  limitMealsPerDay,
  mealCandidate,
  mealSourceId,
  proteinCandidate,
  shopDoneCandidate,
  todaysThreeCandidate,
  weekGoalCandidate,
  welcomeCandidate,
  workoutCandidates,
  type DayFacts,
} from './candidates';

const DATE = '2026-10-20';

describe('candidateKey / candidateXp', () => {
  it('keys by kind and source', () => {
    expect(candidateKey('COOK_FINISHED', 'abc')).toBe('COOK_FINISHED:abc');
  });
});

describe('mealSourceId', () => {
  it('uses the slot index, then the recipe, then a custom entry id', () => {
    expect(mealSourceId({ mealType: 'dinner', slotIndex: 2, recipeId: 'r1' })).toBe('dinner:2');
    expect(mealSourceId({ mealType: 'lunch', slotIndex: 0 })).toBe('lunch:0');
    expect(mealSourceId({ mealType: 'lunch', recipeId: 'r9' })).toBe('lunch:r9');
    expect(mealSourceId({ entryId: 'e5' })).toBe('custom:e5');
    expect(mealSourceId({ mealType: 'snack', entryId: 'e5' })).toBe('custom:e5');
  });
});

describe('mealCandidate', () => {
  it('pays 5 for a logged meal and 10 when it fills a plan slot', () => {
    const free = mealCandidate({ date: DATE, sourceId: 'custom:e1', onPlan: false });
    expect(free).toMatchObject({ kind: 'MEAL_LOGGED', sourceId: 'custom:e1', localDate: DATE });
    expect(free.lines).toEqual([{ code: 'LOGGED', xp: 5 }]);
    expect(candidateXp(free)).toBe(5);

    const planned = mealCandidate({
      date: DATE,
      sourceId: 'dinner:2',
      mealType: 'dinner',
      slotIndex: 2,
      recipeId: 'r1',
      onPlan: true,
    });
    expect(planned.lines).toEqual([
      { code: 'LOGGED', xp: 5 },
      { code: 'ON_PLAN', xp: 5 },
    ]);
    expect(candidateXp(planned)).toBe(10);
    expect(planned.meta).toEqual({ mealType: 'dinner', slotIndex: 2, recipeId: 'r1' });
  });
});

describe('limitMealsPerDay', () => {
  const meals = Array.from({ length: 7 }, (_, i) =>
    mealCandidate({ date: DATE, sourceId: `custom:${i}`, onPlan: false }),
  );

  it('keeps the first 5 − existing', () => {
    expect(limitMealsPerDay(0, meals)).toHaveLength(5);
    expect(limitMealsPerDay(3, meals).map((c) => c.sourceId)).toEqual(['custom:0', 'custom:1']);
    expect(limitMealsPerDay(5, meals)).toEqual([]);
  });

  it('never goes negative', () => {
    expect(limitMealsPerDay(9, meals)).toEqual([]);
  });
});

describe('simple builders', () => {
  it('full day, protein, shop, todays three, week goal, welcome', () => {
    expect(fullDayCandidate(DATE)).toMatchObject({
      kind: 'FULL_DAY',
      sourceId: DATE,
      lines: [{ code: 'FULL_DAY', xp: 15 }],
    });
    expect(proteinCandidate(DATE)).toMatchObject({
      kind: 'PROTEIN_GOAL',
      sourceId: DATE,
      lines: [{ code: 'PROTEIN_GOAL', xp: 10 }],
    });
    expect(shopDoneCandidate({ planId: 'p1', localDate: DATE })).toMatchObject({
      kind: 'SHOP_DONE',
      sourceId: 'p1',
      lines: [{ code: 'SHOP_DONE', xp: 10 }],
    });
    expect(todaysThreeCandidate(DATE)).toMatchObject({
      kind: 'TODAYS_THREE',
      sourceId: DATE,
      lines: [{ code: 'TODAYS_THREE', xp: 40 }],
    });
    const wk = weekGoalCandidate({ weekStart: '2026-10-19', localDate: '2026-10-22' });
    expect(wk).toMatchObject({
      kind: 'WEEK_GOAL',
      sourceId: '2026-10-19',
      localDate: '2026-10-22',
      lines: [{ code: 'WEEK_GOAL', xp: 50 }],
      meta: { weekStart: '2026-10-19' },
    });
    expect(welcomeCandidate(DATE)).toMatchObject({
      kind: 'WELCOME',
      sourceId: '1',
      lines: [{ code: 'WELCOME', xp: 28 }],
    });
  });
});

describe('cookCandidate', () => {
  const base = {
    cookId: 'c1',
    localDate: DATE,
    recipeId: 'r1',
    recipeName: 'Lemon Herb Salmon',
    cookCount: 37,
  };

  it('pays 25, plus 10 the first time', () => {
    const again = cookCandidate({ ...base, firstTime: false });
    expect(again).toMatchObject({ kind: 'COOK_FINISHED', sourceId: 'c1' });
    expect(candidateXp(again)).toBe(25);
    const first = cookCandidate({ ...base, firstTime: true });
    expect(first.lines.map((l) => l.code)).toEqual(['COOKED_AT_HOME', 'FIRST_TIME']);
    expect(candidateXp(first)).toBe(35);
    expect(first.meta).toEqual({
      recipeId: 'r1',
      recipeName: 'Lemon Herb Salmon',
      cookCount: 37,
    });
  });
});

describe('workoutCandidates', () => {
  it('a workout with no PRs is one candidate', () => {
    const out = workoutCandidates({ sessionId: 's1', localDate: DATE, prs: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'WORKOUT_COMPLETED',
      sourceId: 's1',
      lines: [{ code: 'WORKOUT_DONE', xp: 40 }],
    });
  });

  it('keeps the best 3 PRs by value, one line each with the exercise as detail', () => {
    const out = workoutCandidates({
      sessionId: 's1',
      localDate: DATE,
      prs: [
        { kind: 'reps', exerciseName: 'Row' },
        { kind: 'weight', exerciseName: 'Bench press' },
        { kind: 'e1rm', exerciseName: 'Squat' },
        { kind: 'reps', exerciseName: 'Curl' },
        { kind: 'e1rm', exerciseName: 'Deadlift' },
      ],
    });
    expect(out).toHaveLength(2);
    const prs = out[1];
    expect(prs).toMatchObject({ kind: 'WORKOUT_PRS', sourceId: 's1', meta: { prCount: 5 } });
    expect(prs?.lines).toEqual([
      { code: 'PR_E1RM', xp: 20, detail: 'Squat' },
      { code: 'PR_E1RM', xp: 20, detail: 'Deadlift' },
      { code: 'PR_WEIGHT', xp: 15, detail: 'Bench press' },
    ]);
    expect(prs && candidateXp(prs)).toBe(55);
  });

  it('maps each kind to its line code', () => {
    const out = workoutCandidates({
      sessionId: 's2',
      localDate: DATE,
      prs: [
        { kind: 'reps', exerciseName: 'A' },
        { kind: 'weight', exerciseName: 'B' },
      ],
    });
    expect(out[1]?.lines.map((l) => l.code)).toEqual(['PR_WEIGHT', 'PR_REPS']);
  });
});

describe('dayCandidates', () => {
  const day: DayFacts = {
    date: DATE,
    entries: [
      { sourceId: 'breakfast:0', mealType: 'breakfast', slotIndex: 0, onPlan: true },
      { sourceId: 'custom:e2', onPlan: false },
    ],
    planSlots: [{ mealType: 'breakfast', slotIndex: 0 }],
    handledSlots: [{ mealType: 'breakfast', slotIndex: 0 }],
    totals: { kcal: 1500, proteinG: 120, carbsG: 150, fatG: 50 },
    proteinTargetG: 110,
  };

  it('composes meals, the full day and the protein goal', () => {
    const out = dayCandidates(day);
    expect(out.map((c) => c.kind)).toEqual([
      'MEAL_LOGGED',
      'MEAL_LOGGED',
      'FULL_DAY',
      'PROTEIN_GOAL',
    ]);
    expect(out.reduce((n, c) => n + candidateXp(c), 0)).toBe(10 + 5 + 15 + 10);
  });

  it('skips protein without a target or below it, and the full day when a slot is open', () => {
    expect(dayCandidates({ ...day, proteinTargetG: null }).map((c) => c.kind)).not.toContain(
      'PROTEIN_GOAL',
    );
    expect(
      dayCandidates({ ...day, totals: { ...day.totals, proteinG: 109 } }).map((c) => c.kind),
    ).not.toContain('PROTEIN_GOAL');
    expect(dayCandidates({ ...day, handledSlots: [] }).map((c) => c.kind)).not.toContain(
      'FULL_DAY',
    );
  });

  it('a day with nothing logged earns nothing', () => {
    expect(
      dayCandidates({
        ...day,
        entries: [],
        handledSlots: [],
        totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      }),
    ).toEqual([]);
  });
});
