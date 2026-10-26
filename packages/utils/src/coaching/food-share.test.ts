import { describe, expect, it } from 'vitest';
import {
  dbDateKey,
  foodDayParts,
  foodDaySummary,
  planAdherence,
  summarizeFoodWeek,
  trainerNumbersView,
  weekSummaryLines,
  weekWeight,
  weighInsByDay,
  type FoodDayInput,
} from './food-share';

const day = (over: Partial<FoodDayInput> = {}): FoodDayInput => ({
  date: '2026-10-20',
  planned: [
    { type: 'breakfast', recipeId: 'oats', slotIndex: 0 },
    { type: 'lunch', recipeId: 'bowl', slotIndex: 1 },
    { type: 'dinner', recipeId: 'curry', slotIndex: 2 },
  ],
  logged: [
    {
      recipeId: 'oats',
      mealType: 'breakfast',
      slotIndex: 0,
      name: 'Oats',
      kcal: 410.4,
      protein: 21.6,
    },
    {
      custom: { name: 'Shawarma', estimatedBy: 'manual' },
      mealType: 'lunch',
      replacesSlot: { mealType: 'lunch', slotIndex: 1 },
      name: 'Shawarma',
      kcal: 700,
      protein: 35,
    },
  ],
  skipped: [{ mealType: 'dinner', slotIndex: 2 }],
  totals: { kcal: 1110.4, protein: 56.6 },
  target: { kcal: 2200, proteinG: 140 },
  ...over,
});

describe('trainerNumbersView', () => {
  it('follows the client numbers mode and errs on the private side for NONE', () => {
    expect(trainerNumbersView(null)).toBe('FULL');
    expect(trainerNumbersView('garbage')).toBe('FULL');
    expect(trainerNumbersView('PROTEIN_ONLY')).toBe('PROTEIN_ONLY');
    expect(trainerNumbersView('NONE')).toBe('NONE');
  });
});

describe('foodDaySummary', () => {
  it('counts plan adherence: eaten, swapped ("ate something else") and skipped', () => {
    const s = foodDaySummary(day(), 'FULL');
    expect(s.plan).toEqual({ planned: 3, eaten: 1, swapped: 1, skipped: 1 });
    expect(s.mealsLogged).toBe(2);
    expect(s.kcal).toBe(1110);
    expect(s.proteinG).toBe(57);
    expect(s.targetKcal).toBe(2200);
    expect(s.entries.map((e) => [e.name, e.onPlan, e.kcal])).toEqual([
      ['Oats', true, 410],
      ['Shawarma', false, 700],
    ]);
  });

  it('PROTEIN_ONLY never carries a calorie number; NONE carries no numbers at all', () => {
    const protein = foodDaySummary(day(), 'PROTEIN_ONLY');
    expect([protein.kcal, protein.targetKcal, protein.entries[0]?.kcal]).toEqual([
      null,
      null,
      null,
    ]);
    expect(protein.proteinG).toBe(57);
    const none = foodDaySummary(day(), 'NONE');
    expect(JSON.stringify(none)).not.toMatch(/"(kcal|proteinG|targetKcal|targetProteinG)":\d/);
    expect(none.plan?.eaten).toBe(1);
  });

  it('an unlogged day has no totals, and a day without a plan has no adherence', () => {
    const empty = foodDaySummary(day({ logged: [], totals: null, planned: null }), 'FULL');
    expect(empty).toMatchObject({ mealsLogged: 0, kcal: null, proteinG: null, plan: null });
    expect(empty.targetKcal).toBe(2200);
  });
});

describe('planAdherence', () => {
  it('is eaten ÷ planned over the days, null with nothing planned', () => {
    expect(
      planAdherence([
        { plan: { planned: 3, eaten: 1, swapped: 1, skipped: 1 } },
        { plan: { planned: 1, eaten: 1, swapped: 0, skipped: 0 } },
        { plan: null },
      ]),
    ).toBe(0.5);
    expect(planAdherence([{ plan: null }])).toBeNull();
  });
});

describe('weighInsByDay', () => {
  it('keeps the last weigh-in per day, oldest first, from the window start', () => {
    expect(
      weighInsByDay(
        [
          { recordedAt: new Date('2026-10-02T08:00:00Z'), weightKg: 80.04 },
          { recordedAt: new Date('2026-10-02T20:00:00Z'), weightKg: 80.6 },
          { recordedAt: new Date('2026-09-01T08:00:00Z'), weightKg: 82 },
          { recordedAt: new Date('2026-10-01T08:00:00Z'), weightKg: 81 },
        ],
        '2026-09-15',
      ),
    ).toEqual([
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 80.6 },
    ]);
  });
});

describe('dbDateKey', () => {
  it('reads the calendar day a @db.Date column holds, whatever the host time zone', () => {
    expect(dbDateKey(new Date('2026-10-05T00:00:00.000Z'))).toBe('2026-10-05');
    expect(dbDateKey(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('summarizeFoodWeek', () => {
  const row = (kcal: number | null, meals: number, planned = 0, eaten = 0) => ({
    date: '2026-10-20',
    mealsLogged: meals,
    kcal,
    proteinG: kcal === null ? null : kcal / 20,
    targetKcal: 2000,
    targetProteinG: 120,
    plan: planned > 0 ? { planned, eaten, swapped: 0, skipped: 0 } : null,
    entries: [],
  });

  it('averages over logged days only; an unlogged day is unknown, not zero', () => {
    const week = summarizeFoodWeek(
      [row(1800, 3, 3, 2), row(null, 0, 3, 0), row(2200, 4, 3, 3)],
      'FULL',
    );
    expect(week).toMatchObject({
      daysLogged: 2,
      mealsLogged: 7,
      avgKcal: 2000,
      avgProteinG: 100,
      targetKcal: 2000,
      planAdherence: 5 / 9,
    });
  });

  it('carries no average the numbers view hides', () => {
    const week = summarizeFoodWeek([{ ...row(null, 2), proteinG: null, targetKcal: null }], 'NONE');
    expect(week.avgKcal).toBeNull();
    expect(week.targetKcal).toBeNull();
  });
});

describe('weekWeight', () => {
  it('latest weigh-in and its change since the last one on or before a week ago', () => {
    expect(
      weekWeight(
        [
          { date: '2026-10-10', weightKg: 81 },
          { date: '2026-10-14', weightKg: 80.6 },
          { date: '2026-10-20', weightKg: 80.1 },
        ],
        '2026-10-15',
      ),
    ).toEqual({ latest: { date: '2026-10-20', weightKg: 80.1 }, changeKg: -0.5 });
    expect(weekWeight([{ date: '2026-10-20', weightKg: 80 }], '2026-10-15').changeKg).toBeNull();
    expect(weekWeight([], '2026-10-15')).toEqual({ latest: null, changeKg: null });
  });
});

describe('weekSummaryLines', () => {
  const format = {
    weightKg: (kg: number, signed?: boolean) => `${signed && kg > 0 ? '+' : ''}${kg.toFixed(1)} kg`,
    date: (d: string) => d,
  };
  const base = {
    from: '2026-10-16',
    to: '2026-10-22',
    workouts: { done: 2, goal: 3 },
    sharing: { food: false, weight: false },
    food: null,
    weight: null,
  };

  it('says what is not shared, and nothing else, when neither is', () => {
    const lines = weekSummaryLines(base, 'Maria', format);
    expect(lines).toMatchObject({ workouts: '2 of 3 workouts', food: null, weight: null });
    expect(lines.notShared?.title).toBe('Maria doesn’t share food or weight with you.');
  });

  it('food and weight lines, with hidden numbers named', () => {
    const lines = weekSummaryLines(
      {
        ...base,
        sharing: { food: true, weight: true },
        food: {
          numbers: 'PROTEIN_ONLY',
          daysLogged: 5,
          mealsLogged: 14,
          avgKcal: null,
          avgProteinG: 110,
          targetKcal: null,
          targetProteinG: 125,
          planAdherence: 0.7,
        },
        weight: { latest: { date: '2026-10-22', weightKg: 64.2 }, changeKg: -0.4 },
      },
      'Maria',
      format,
    );
    expect(lines.food).toEqual([
      'Food logged 5 of 7 days',
      'Maria hides calories in Chefer.',
      '110 of 125 g protein a day',
      '70% of planned meals eaten as planned',
    ]);
    expect(lines.weight).toEqual(['64.2 kg · 2026-10-22', '−0.4 kg in 7 days']);
    expect(lines.notShared).toBeNull();
  });
});

describe('foodDayParts', () => {
  it('reads a logged day in the shown numbers, and an empty one as nothing logged', () => {
    const full = foodDaySummary(day(), 'FULL');
    expect(foodDayParts(full)).toEqual([
      '2 meals',
      '1,110 / 2,200 kcal',
      '57 / 140 g protein',
      '1 of 3 planned',
    ]);
    expect(foodDayParts(foodDaySummary(day(), 'NONE'))).toEqual(['2 meals', '1 of 3 planned']);
    expect(foodDayParts(foodDaySummary(day({ logged: [], totals: null }), 'FULL'))).toEqual([
      'Nothing logged',
    ]);
  });
});
