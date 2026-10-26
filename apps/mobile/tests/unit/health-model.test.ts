import {
  chunk,
  HC_EXERCISE,
  healthConnectExerciseType,
  healthKitActivityType,
  healthMealType,
  HK_ACTIVITY,
  mealWindow,
  nextWeightCursor,
  planNutritionSync,
  todayActivityLabel,
  toImportedWeights,
  WEIGHT_LOOKBACK_DAYS,
  weightImportSince,
  type HealthMeal,
  type WeightSample,
} from '../../src/features/health/health-model';

// C2: what is read from and written to Apple Health / Health Connect.

const sample = (over: Partial<WeightSample> = {}): WeightSample => ({
  id: 'w1',
  weightKg: 80.123,
  at: new Date(2026, 9, 20, 7, 30),
  fromChefer: false,
  ...over,
});

const meal = (entryId: string): HealthMeal => ({
  entryId,
  mealType: 'lunch',
  name: 'Bowl',
  kcal: 500,
  proteinG: 30,
  carbsG: 50,
  fatG: 15,
  ...mealWindow('2026-10-20', 'lunch'),
});

describe('toImportedWeights', () => {
  it('maps a sample to a weigh-in on its local day, rounded to 0.01 kg', () => {
    expect(toImportedWeights([sample()])).toEqual([
      { externalId: 'w1', weightKg: 80.12, date: '2026-10-20' },
    ]);
  });

  it('never re-imports what Chefer wrote, out-of-range weights or a repeated id', () => {
    const out = toImportedWeights([
      sample({ id: 'own', fromChefer: true }),
      sample({ id: 'tiny', weightKg: 3 }),
      sample({ id: 'huge', weightKg: 900 }),
      sample({ id: 'a' }),
      sample({ id: 'a', weightKg: 81 }),
    ]);
    expect(out.map((w) => w.externalId)).toEqual(['a']);
  });
});

describe('weight cursor', () => {
  const now = new Date(2026, 9, 26, 12, 0);

  it('starts the first import 90 days back, later ones from the cursor', () => {
    expect(weightImportSince(null, now).getTime()).toBe(
      now.getTime() - WEIGHT_LOOKBACK_DAYS * 86_400_000,
    );
    expect(weightImportSince('2026-10-01T08:00:00.000Z', now).toISOString()).toBe(
      '2026-10-01T08:00:00.000Z',
    );
  });

  it('moves to the newest sample and never backwards', () => {
    const later = sample({ at: new Date('2026-10-25T07:00:00.000Z') });
    const earlier = sample({ at: new Date('2026-10-02T07:00:00.000Z') });
    expect(nextWeightCursor([earlier, later], null)).toBe('2026-10-25T07:00:00.000Z');
    expect(nextWeightCursor([earlier], '2026-10-10T00:00:00.000Z')).toBe(
      '2026-10-10T00:00:00.000Z',
    );
    expect(nextWeightCursor([], null)).toBeNull();
  });

  it('pages a long history', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('food records', () => {
  it('maps Chefer slots to the store meal types (anything else is a snack)', () => {
    expect(['BREAKFAST', 'lunch', 'Dinner', 'SNACK', 'pre-workout'].map(healthMealType)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'snack',
    ]);
  });

  it("puts an entry at its slot's usual hour on that local day, for 30 minutes", () => {
    const { start, end } = mealWindow('2026-10-20', 'dinner');
    expect(start).toEqual(new Date(2026, 9, 20, 19, 0));
    expect(end.getTime() - start.getTime()).toBe(30 * 60_000);
  });

  it('upserts every current entry and removes the ones that are gone', () => {
    const plan = planNutritionSync(['a', 'b', 'c'], [meal('a'), meal('d')]);
    expect(plan.upsert.map((m) => m.entryId)).toEqual(['a', 'd']);
    expect(plan.remove).toEqual(['b', 'c']);
  });
});

describe('workout types', () => {
  it('maps cardio types and defaults to strength training', () => {
    expect(healthConnectExerciseType('RUNNING')).toBe(HC_EXERCISE.RUNNING);
    expect(healthConnectExerciseType('SPIN')).toBe(HC_EXERCISE.BIKING);
    expect(healthConnectExerciseType(null)).toBe(HC_EXERCISE.STRENGTH_TRAINING);
    expect(healthKitActivityType('YOGA')).toBe(HK_ACTIVITY.yoga);
    expect(healthKitActivityType('OTHER')).toBe(HK_ACTIVITY.other);
    expect(healthKitActivityType(null)).toBe(HK_ACTIVITY.traditionalStrengthTraining);
  });
});

describe('todayActivityLabel', () => {
  it('joins what is known and hides what is not', () => {
    expect(todayActivityLabel({ steps: 6240, activeKcal: 312 })).toBe(
      '6,240 steps · 312 kcal active',
    );
    expect(todayActivityLabel({ steps: 1, activeKcal: null })).toBe('1 step');
    expect(todayActivityLabel({ steps: null, activeKcal: null })).toBeNull();
  });
});
