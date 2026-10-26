import { describe, expect, it } from 'vitest';
import {
  dbDateKey,
  foodDaySummary,
  planAdherence,
  trainerNumbersView,
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
