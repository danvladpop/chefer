// Guardrail 1: no rule rewards eating less or weighing less. The only intake
// number a rule may read is protein, and only upward.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { candidateXp, dayCandidates, type DayFacts } from './candidates';

const mealType = fc.constantFrom(
  'breakfast' as const,
  'lunch' as const,
  'dinner' as const,
  'snack' as const,
);
const slot = fc.record({ mealType, slotIndex: fc.integer({ min: 0, max: 3 }) });

const dayFacts: fc.Arbitrary<DayFacts> = fc.record({
  date: fc.constant('2026-10-22'),
  entries: fc.array(
    fc.record(
      {
        sourceId: fc.string({ minLength: 1, maxLength: 8 }),
        mealType,
        slotIndex: fc.integer({ min: 0, max: 3 }),
        recipeId: fc.string({ minLength: 1, maxLength: 6 }),
        onPlan: fc.boolean(),
      },
      { requiredKeys: ['sourceId', 'onPlan'] },
    ),
    { maxLength: 8 },
  ),
  planSlots: fc.array(slot, { maxLength: 4 }),
  handledSlots: fc.array(slot, { maxLength: 4 }),
  totals: fc.record({
    kcal: fc.integer({ min: 0, max: 6000 }),
    proteinG: fc.integer({ min: 0, max: 300 }),
    carbsG: fc.integer({ min: 0, max: 800 }),
    fatG: fc.integer({ min: 0, max: 300 }),
  }),
  proteinTargetG: fc.option(fc.integer({ min: 40, max: 250 }), { nil: null }),
});

const totalXp = (day: DayFacts) => dayCandidates(day).reduce((n, c) => n + candidateXp(c), 0);

describe('no rule rewards eating less', () => {
  it('lowering kcal, carbs or fat never changes the XP of a day', () => {
    fc.assert(
      fc.property(
        dayFacts,
        fc.integer({ min: 0, max: 6000 }),
        fc.integer({ min: 0, max: 800 }),
        fc.integer({ min: 0, max: 300 }),
        (day, kcal, carbsG, fatG) => {
          const lowered: DayFacts = {
            ...day,
            totals: {
              ...day.totals,
              kcal: Math.min(day.totals.kcal, kcal),
              carbsG: Math.min(day.totals.carbsG, carbsG),
              fatG: Math.min(day.totals.fatG, fatG),
            },
          };
          expect(totalXp(lowered)).toBe(totalXp(day));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('lowering protein never raises the XP of a day', () => {
    fc.assert(
      fc.property(dayFacts, fc.integer({ min: 0, max: 300 }), (day, proteinG) => {
        const lowered: DayFacts = {
          ...day,
          totals: { ...day.totals, proteinG: Math.min(day.totals.proteinG, proteinG) },
        };
        expect(totalXp(lowered)).toBeLessThanOrEqual(totalXp(day));
      }),
      { numRuns: 300 },
    );
  });

  it('raising protein never lowers it either (it can only matter upward)', () => {
    fc.assert(
      fc.property(dayFacts, fc.integer({ min: 0, max: 300 }), (day, extra) => {
        const raised: DayFacts = {
          ...day,
          totals: { ...day.totals, proteinG: day.totals.proteinG + extra },
        };
        expect(totalXp(raised)).toBeGreaterThanOrEqual(totalXp(day));
      }),
      { numRuns: 300 },
    );
  });
});
