import { describe, expect, it } from 'vitest';
import type { PlanTrainingDay } from '@chefer/types';
import {
  describeSnackProteinOnly,
  estimateKcalFromProtein,
  NUMBERS_MODE_COPY,
  nutritionLabel,
  PROTEIN_ONLY_KCAL_PER_PROTEIN_G,
  proteinAverageText,
  proteinLabel,
  proteinOnlyHeadline,
  proteinOnlyOfferCopy,
  proteinOnlyTrainingExplain,
  proteinOnlyTrainingHeader,
  proteinRingLabel,
  withoutKcalLines,
} from './numbers-mode-copy';

describe('numbers-mode copy (WP-08)', () => {
  it('words the weekly average as protein only', () => {
    expect(proteinAverageText({ protein: 112.4 })).toBe(
      'This week you averaged 112 g protein a day',
    );
  });

  it('labels a row with kcal in full mode and protein in protein-only mode', () => {
    expect(nutritionLabel({ kcal: 519.6, protein: 31.7 }, false)).toBe('520 kcal');
    expect(nutritionLabel({ kcal: 519.6, protein: 31.7 }, true)).toBe('32 g protein');
  });

  it('estimates the kcal a protein-only entry carries, within what one entry can hold', () => {
    expect(estimateKcalFromProtein(30)).toBe(480);
    expect(estimateKcalFromProtein(500)).toBe(5000);
  });

  it('drops every calorie line of server-written text', () => {
    expect(
      withoutKcalLines(
        'Steady week.\nYou averaged 2,100 kcal.\nYour calorie budget moved.\nEat more fibre.',
      ),
    ).toBe('Steady week.\nEat more fibre.');
    expect(withoutKcalLines('Only 2,100 kcal here.')).toBe('');
  });

  it('keeps just the protein clause of the rebalance headline', () => {
    expect(
      proteinOnlyHeadline(
        "You're about 600 kcal over for the week and 36 g short on protein this week.",
      ),
    ).toBe("You're 36 g short on protein this week.");
    expect(proteinOnlyHeadline("You're about 600 kcal over for the week.")).toBe('');
  });

  it('describes swaps by protein and never quotes the server explanation (it may carry kcal)', () => {
    expect(
      proteinOnlyOfferCopy([
        {
          dayOfWeek: 6,
          mealType: 'dinner',
          previousRecipeId: 'a',
          newRecipeId: 'b',
          newRecipeName: 'Chicken bowl',
          previousKcal: 520,
          newKcal: 700,
          previousProteinG: 14,
          newProteinG: 42,
          reason: 'calories',
          explanation: 'Sunday dinner → Chicken bowl (+180 kcal, +28 g protein)',
        },
      ]),
    ).toBe('I can rebalance the rest of your week: Sunday dinner → Chicken bowl (+28 g protein).');
  });

  it('shares the kcal-per-gram rule that quick add uses', () => {
    expect(PROTEIN_ONLY_KCAL_PER_PROTEIN_G).toBe(16);
    expect(estimateKcalFromProtein(0)).toBe(0);
    expect(estimateKcalFromProtein(32.4)).toBe(518);
  });

  it('words the protein ring and a protein label without any calorie figure', () => {
    expect(proteinRingLabel(72.4, 120)).toBe('72 of 120 g protein');
    expect(proteinLabel(31.7)).toBe('32 g protein');
    expect(proteinRingLabel(1200, 2000)).toBe('1,200 of 2,000 g protein');
  });

  it('describes a protein snack without its calories', () => {
    expect(
      describeSnackProteinOnly({
        id: 'yog',
        name: 'Greek yogurt with honey',
        proteinG: 17.2,
        kcal: 150,
      }),
    ).toBe('Greek yogurt with honey (+17 g protein)');
  });

  it('offers no offer line when there are no swaps', () => {
    expect(proteinOnlyOfferCopy([])).toBe('');
  });

  it('shares the question and both answers of the numbers-mode picker', () => {
    expect(NUMBERS_MODE_COPY.question).toBe('What do you want to keep an eye on?');
    expect(NUMBERS_MODE_COPY.fullTitle).toBe('Calories and macros');
    expect(NUMBERS_MODE_COPY.proteinTitle).toBe('Just protein');
  });

  describe('training copy', () => {
    const lift: PlanTrainingDay = {
      dayOfWeek: 0,
      dayName: 'Monday',
      kind: 'lift',
      workoutName: 'Push day',
      kcalBonus: 150,
      proteinBonus: 20,
      carbsBonus: 0,
      done: false,
      applied: true,
      targetKcal: 2350,
      targetProteinG: 140,
    };
    const run: PlanTrainingDay = {
      ...lift,
      dayOfWeek: 2,
      dayName: 'Wednesday',
      kind: 'long_run',
      workoutName: null,
      proteinBonus: 0,
    };

    it('names a lifting day and its protein bump, never calories', () => {
      const h = proteinOnlyTrainingHeader(lift);
      expect(h.title).toBe('Training day · Push day');
      expect(h.targetLine).toBe('Target 140 g protein');
      expect(h.bonusLine).toBe('(+20 g protein for training)');
      expect(JSON.stringify(h)).not.toMatch(/kcal|calor/i);
    });

    it('only names a run day', () => {
      const h = proteinOnlyTrainingHeader(run);
      expect(h.targetLine).toBeNull();
      expect(h.bonusLine).toBeNull();
      expect(JSON.stringify(h)).not.toMatch(/kcal|calor/i);
    });

    it('explains the protein bump without any calorie row', () => {
      const e = proteinOnlyTrainingExplain({
        days: [lift],
        basis: { restKcal: 2200, restProteinG: 120, proteinGPerKg: 1.8, bodyweightKg: 75 },
      });
      expect(e.sentence).toContain('your protein goes up by about 20 g');
      expect(e.rows.map((r) => r.label)).toEqual([
        'Rest-day protein',
        'Training-day protein',
        'Protein basis (1.8 g per kg, because you train)',
      ]);
      expect(JSON.stringify(e)).not.toMatch(/kcal|calor/i);
    });
  });
});
