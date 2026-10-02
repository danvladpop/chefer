import { describe, expect, it } from 'vitest';
import { defaultCookServings, finishMealCopy, parseStepDuration } from './cook-mode';

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
