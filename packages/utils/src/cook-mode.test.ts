import { describe, expect, it } from 'vitest';
import {
  clampCookServings,
  cookTimerRemaining,
  cookTimerStatus,
  defaultCookServings,
  finishMealCopy,
  formatCookTimer,
  isCookTimer,
  matchStepIngredients,
  MAX_COOK_SERVINGS,
  newCookTimer,
  parseServingsParam,
  parseStepDuration,
  pauseCookTimer,
  resetCookTimer,
  startCookTimer,
  stepIngredientAmounts,
} from './cook-mode';

describe('parseStepDuration (P1-3 inline timers)', () => {
  it('parses simple minute durations', () => {
    expect(parseStepDuration('Simmer covered for 15 minutes.')).toBe(15 * 60);
    expect(parseStepDuration('Poach for 3 min.')).toBe(3 * 60);
  });

  it('uses the upper bound of a range — better an over-timer than raw food', () => {
    expect(parseStepDuration('Roast for 12-15 minutes until golden.')).toBe(15 * 60);
    expect(parseStepDuration('Bake 25–30 min.')).toBe(30 * 60);
  });

  it('parses hours', () => {
    expect(parseStepDuration('Marinate for 1 hour.')).toBe(3600);
    expect(parseStepDuration('Slow-cook 2 hrs.')).toBe(2 * 3600);
  });

  it('returns null when no duration is mentioned', () => {
    expect(parseStepDuration('Season with salt and pepper.')).toBeNull();
    expect(parseStepDuration('Serve immediately.')).toBeNull();
  });

  it('ignores absurd durations', () => {
    expect(parseStepDuration('Ferment for 48 hours.')).toBeNull();
  });
});

describe('defaultCookServings (P1-1, P2-3, UX-REC-02)', () => {
  it('starts at the recipe servings without a household', () => {
    expect(defaultCookServings(2, null)).toBe(2);
    expect(defaultCookServings(2, null, 1.5)).toBe(3);
    expect(defaultCookServings(2, [])).toBe(2);
  });

  it('is the user portion plus every member (owner 2x + Mia 1/2 + Noah 1 = 3.5)', () => {
    const members = [{ portionFactor: 0.5 }, { portionFactor: 1 }];
    expect(defaultCookServings(1, members, 2)).toBe(3.5);
    expect(defaultCookServings(1, members)).toBe(2.5);
  });

  it('never multiplies the owner portion across the whole table', () => {
    const members = [{ portionFactor: 1 }, { portionFactor: 1 }];
    expect(defaultCookServings(1, members, 1.25)).toBe(3.25);
  });

  it('"two of us" cooks a one-serving recipe for the table but leaves a pot recipe alone', () => {
    expect(defaultCookServings(1, null, 1, 2)).toBe(2);
    expect(defaultCookServings(1, null, 1.25, 2)).toBe(2.25);
    expect(defaultCookServings(4, null, 1, 2)).toBe(4);
  });
});

describe('finishMealCopy (bug B-21 — no clock-guessed meal name)', () => {
  it('names the real meal when one was passed', () => {
    expect(finishMealCopy('dinner')).toBe('Enjoy your dinner!');
    expect(finishMealCopy('breakfast')).toBe('Enjoy your breakfast!');
  });

  it('falls back to a generic "Enjoy!" instead of guessing from the clock', () => {
    expect(finishMealCopy(undefined)).toBe('Enjoy!');
    expect(finishMealCopy(null)).toBe('Enjoy!');
    expect(finishMealCopy('')).toBe('Enjoy!');
  });
});

describe('servings handed to cook mode (UX-COOK-05)', () => {
  it('shares one cap between the recipe page and cook mode', () => {
    expect(MAX_COOK_SERVINGS).toBe(20);
    expect(clampCookServings(0)).toBe(1);
    expect(clampCookServings(35)).toBe(20);
    expect(clampCookServings(6)).toBe(6);
  });

  it('parses the route param and ignores junk', () => {
    expect(parseServingsParam('6')).toBe(6);
    expect(parseServingsParam('2.5')).toBe(2.5);
    expect(parseServingsParam('99')).toBe(20);
    expect(parseServingsParam('0')).toBeNull();
    expect(parseServingsParam('abc')).toBeNull();
    expect(parseServingsParam('')).toBeNull();
    expect(parseServingsParam(undefined)).toBeNull();
  });
});

describe('matchStepIngredients (UX-COOK-04)', () => {
  const ingredients = [
    { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
    { name: 'Garlic cloves', quantity: 3, unit: '' },
    { name: 'Chopped tomatoes (canned)', quantity: 400, unit: 'g' },
    { name: 'Salt', quantity: 1, unit: 'to taste' },
    { name: 'Chicken breast, sliced', quantity: 500, unit: 'g' },
  ];

  it('finds ingredients by name, plural or head word, in recipe order', () => {
    expect(matchStepIngredients('Heat the oil, then fry the garlic.', ingredients)).toEqual([0, 1]);
    expect(matchStepIngredients('Tip in the tomatoes and simmer.', ingredients)).toEqual([2]);
    expect(matchStepIngredients('Brown the chicken.', ingredients)).toEqual([4]);
  });

  it('finds nothing for a step that names no ingredient', () => {
    expect(matchStepIngredients('Let it rest for ten minutes.', ingredients)).toEqual([]);
    expect(matchStepIngredients('', ingredients)).toEqual([]);
  });

  it('ignores descriptors such as "fresh" or "chopped" on their own', () => {
    const list = [{ name: 'Fresh basil', quantity: 1, unit: 'cup' }];
    expect(matchStepIngredients('Add fresh herbs.', list)).toEqual([]);
    expect(matchStepIngredients('Tear in the basil.', list)).toEqual([0]);
  });

  it('scales the amounts and keeps "to taste" unscaled', () => {
    const out = stepIngredientAmounts(
      'Fry the garlic in oil and add salt.',
      ingredients,
      2,
      'METRIC',
    );
    expect(out.map((o) => [o.name, o.amount])).toEqual([
      ['Olive oil', '4 tbsp'],
      ['Garlic cloves', '6'],
      ['Salt', 'To taste'],
    ]);
  });

  it("prints amounts in the user's unit system", () => {
    const out = stepIngredientAmounts('Add the chicken.', ingredients, 1, 'IMPERIAL');
    expect(out[0]?.amount).toMatch(/lb|oz/);
  });
});

describe('cook timers as endsAt (UX-COOK-01)', () => {
  const t0 = 1_000_000;

  it('starts idle with the full time', () => {
    const t = newCookTimer(300);
    expect(cookTimerStatus(t, t0)).toBe('idle');
    expect(cookTimerRemaining(t, t0)).toBe(300);
  });

  it('runs against the clock, so a step change or background never loses time', () => {
    const t = startCookTimer(newCookTimer(300), t0);
    expect(t.endsAt).toBe(t0 + 300_000);
    expect(cookTimerStatus(t, t0 + 1000)).toBe('running');
    expect(cookTimerRemaining(t, t0 + 120_000)).toBe(180);
  });

  it('rounds the remainder up', () => {
    const t = startCookTimer(newCookTimer(10), t0);
    expect(cookTimerRemaining(t, t0 + 9_600)).toBe(1);
  });

  it('pauses and resumes from what was left', () => {
    const running = startCookTimer(newCookTimer(300), t0);
    const paused = pauseCookTimer(running, t0 + 100_000);
    expect(cookTimerStatus(paused, t0 + 999_999)).toBe('paused');
    expect(cookTimerRemaining(paused, t0 + 999_999)).toBe(200);
    const resumed = startCookTimer(paused, t0 + 500_000);
    expect(resumed.endsAt).toBe(t0 + 500_000 + 200_000);
  });

  it('is done once endsAt passes, and starting a done timer restarts it', () => {
    const t = startCookTimer(newCookTimer(60), t0);
    expect(cookTimerStatus(t, t0 + 60_000)).toBe('done');
    expect(cookTimerRemaining(t, t0 + 90_000)).toBe(0);
    const again = startCookTimer(t, t0 + 90_000);
    expect(again.endsAt).toBe(t0 + 90_000 + 60_000);
  });

  it('resets to idle', () => {
    const t = pauseCookTimer(startCookTimer(newCookTimer(60), t0), t0 + 10_000);
    expect(cookTimerStatus(resetCookTimer(t), t0)).toBe('idle');
  });

  it('formats m:ss and h:mm:ss', () => {
    expect(formatCookTimer(5)).toBe('0:05');
    expect(formatCookTimer(245)).toBe('4:05');
    expect(formatCookTimer(3723)).toBe('1:02:03');
    expect(formatCookTimer(-3)).toBe('0:00');
  });

  it('validates persisted timers', () => {
    expect(isCookTimer(newCookTimer(10))).toBe(true);
    expect(isCookTimer({ durationSec: 1, remainingSec: 1, endsAt: 5 })).toBe(true);
    expect(isCookTimer({ durationSec: 1 })).toBe(false);
    expect(isCookTimer(null)).toBe(false);
  });
});
