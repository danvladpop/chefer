import {
  estimateKcalFromProtein,
  nutritionLabel,
  proteinAverageText,
  proteinOnlyHeadline,
  proteinOnlyOfferCopy,
  withoutKcalLines,
} from '../../src/features/numbers-mode/numbers-mode-copy';
import { youHadText } from '../../src/features/tracker/slot-copy';

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

  it('"You had" names the protein in protein-only mode and the calories otherwise', () => {
    const entry = { custom: { name: 'Shawarma' }, kcal: 780, protein: 40 };
    expect(youHadText(entry)).toBe('You had: Shawarma (≈ 780 kcal)');
    expect(youHadText(entry, true)).toBe('You had: Shawarma (≈ 40 g protein)');
    expect(youHadText({ custom: { name: 'Shawarma' }, kcal: 780 }, true)).toBe('You had: Shawarma');
  });
});
