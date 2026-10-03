import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import { PLAN_FEATURES, PREMIUM_JOB_IDS, PREMIUM_SOURCES } from '@chefer/types';
import {
  allPitchStrings,
  downgradeLosses,
  hasFoodJob,
  isBulletAvailable,
  PREMIUM_PITCH_COPY,
  premiumJobFor,
  premiumPitchFor,
  showSnapTaste,
} from './premium-pitch';

const PRICE_OR_PURCHASE =
  /[€$£]|\b(checkout|subscribe|subscription|purchase|buy|per month|\/month|billing|invoice|app store|web app)\b|https?:/i;

describe('every source maps to a job (AC1)', () => {
  it('each known source resolves to a job with a headline, a lede and live bullets', () => {
    for (const source of PREMIUM_SOURCES) {
      const pitch = premiumPitchFor(source);
      expect(PREMIUM_JOB_IDS).toContain(pitch.job);
      expect(pitch.headline.length).toBeGreaterThan(0);
      expect(pitch.lede.length).toBeGreaterThan(0);
      expect(pitch.bullets.length).toBeGreaterThan(0);
      expect(pitch.bullets.length).toBeLessThanOrEqual(3);
    }
  });

  it('headlines the job the source unlocks', () => {
    expect(premiumPitchFor('household', { context: { tableSize: 4 } }).headline).toBe(
      'Keep portions for your table of 4',
    );
    expect(premiumPitchFor('recipe-import').headline).toBe(
      'Turn your saved links and videos into recipes',
    );
    expect(premiumPitchFor('training-day').headline).toBe('A week built around your training days');
    expect(premiumPitchFor('training-week').job).toBe('training');
    expect(premiumPitchFor('shopping-list').headline).toBe('Weeks that fit your budget');
    expect(premiumPitchFor('pantry').headline).toBe("Plans that use what's in your kitchen");
    expect(premiumPitchFor('chat-locked').headline).toBe('Ask the chef');
    expect(premiumPitchFor('chat-quota').job).toBe('chat');
    expect(premiumPitchFor('snap-scan').headline).toBe('Log a meal with a photo');
  });

  it('the ingredient-autofill source has its own pitch entry (T-40.11)', () => {
    const pitch = premiumPitchFor('ingredient-autofill');
    expect(pitch.job).toBe('ingredient-autofill');
    expect(pitch.headline).toBe('Fill in nutrition in one tap');
    expect(pitch.ai).toBe(true);
  });

  it('an unknown or missing source falls back to the default pitch', () => {
    for (const source of ['profile', 'monday-nudge', 'who-knows', '', null, undefined]) {
      expect(premiumPitchFor(source).job).toBe('default');
    }
    expect(premiumPitchFor('who-knows').headline).toBe('Your week, ready every Monday');
  });

  it('fills the household copy from context, with a generic fallback', () => {
    const named = premiumPitchFor('household', { context: { tableSize: 4, kidName: 'Luca' } });
    expect(named.bullets[0]).toBe("Recipes scaled to 4 portions — Luca's ½ counted");
    const bare = premiumPitchFor('household');
    expect(bare.headline).toBe('Keep portions right for your table');
    expect(bare.bullets[0]).toBe('Recipes scaled to everyone at your table');
  });
});

describe('gym-first default for Train users (D-11)', () => {
  it('a Train user on a default source gets the training-week pitch', () => {
    const pitch = premiumPitchFor('profile', { jobs: ['TRAIN'] });
    expect(pitch.job).toBe('gym-first');
    expect(pitch.headline).toBe('Food that fits your training week');
    expect(pitch.bullets).toContain('Everything in the gym stays free');
  });

  it('a food-only user keeps the plain default', () => {
    expect(premiumPitchFor('profile', { jobs: ['PLAN_MEALS'] }).job).toBe('default');
  });

  it('an explicit source keeps its own job even for a Train user', () => {
    expect(premiumPitchFor('household', { jobs: ['TRAIN'] }).job).toBe('household');
    expect(premiumJobFor('pantry', ['TRAIN'])).toBe('pantry');
  });

  it('never pitches the gym as Premium — the gym stays free', () => {
    expect(PLAN_FEATURES.gymTraining.free).toBe(true);
    const gymLines = allPitchStrings().filter((s) => /gym/i.test(s));
    expect(gymLines.length).toBeGreaterThan(0);
    for (const line of gymLines) {
      // Every mention of the gym in a pitch says it stays free.
      expect(line).toMatch(/free/i);
    }
  });

  it('retires the training bump bullet when the flag makes it free', () => {
    const on = premiumPitchFor('training-day', { flags: { trainingBumpFree: true } });
    const off = premiumPitchFor('training-day', { flags: {} });
    expect(on.bullets.some((t) => t.includes('More calories and protein'))).toBe(false);
    expect(off.bullets.some((t) => t.includes('More calories and protein'))).toBe(true);
  });
});

describe('a bullet whose feature is not live never renders (AC3)', () => {
  it('a "planned" bullet is never available', () => {
    expect(isBulletAvailable({ feature: 'planned' })).toBe(false);
    for (const source of PREMIUM_SOURCES) {
      expect(premiumPitchFor(source).bullets.join(' | ')).not.toMatch(
        /Re-planned when your training days change|Refuel snacks|Cheaper swaps/,
      );
    }
  });

  it('a premium feature the matrix does not grant is not available', () => {
    // householdPlans is premium-only; a "free claim" about it must fail.
    expect(isBulletAvailable({ feature: 'householdPlans' })).toBe(true);
    expect(isBulletAvailable({ feature: 'householdPlans', freeClaim: true })).toBe(false);
    // the gym is free: a free claim holds.
    expect(isBulletAvailable({ feature: 'gymTraining', freeClaim: true })).toBe(true);
  });

  it('flags retire a bullet made free', () => {
    expect(
      isBulletAvailable(
        { feature: 'budgetAwarePlanning', hiddenWhenFlag: 'budgetFree' },
        {
          budgetFree: true,
        },
      ),
    ).toBe(false);
  });
});

describe('also included', () => {
  it('excludes the current job, lists AI jobs last with the allowance suffix', () => {
    const pitch = premiumPitchFor('household');
    expect(pitch.alsoIncluded).not.toContain('Portions for your table');
    const firstAi = pitch.alsoIncluded.findIndex((l) => l.endsWith('(daily allowance)'));
    expect(firstAi).toBeGreaterThan(0);
    expect(pitch.alsoIncluded.slice(firstAi).every((l) => l.endsWith('(daily allowance)'))).toBe(
      true,
    );
    expect(pitch.alsoIncluded.slice(0, firstAi).some((l) => l.includes('allowance'))).toBe(false);
  });
});

describe('terms and forbidden copy (rules 1 and 2)', () => {
  it('every pitch carries the included-at-no-cost terms paragraph', () => {
    for (const source of [...PREMIUM_SOURCES, 'unknown']) {
      const { terms } = premiumPitchFor(source);
      expect(terms.heading).toBe('INCLUDED');
      expect(terms.body).toBe(
        'Premium is included at no cost. Turning it on unlocks everything listed above.',
      );
    }
  });

  it('R-04: no copy implies a future price or payment method', () => {
    const strings = [...Object.values(PREMIUM_PITCH_COPY), ...allPitchStrings()];
    for (const text of strings) {
      expect(text).not.toMatch(/for now|\bcard\b|before it has a price|payment|30 days/i);
    }
  });

  it('has no "beta" anywhere a user reads it', () => {
    const strings = [...Object.values(PREMIUM_PITCH_COPY), ...allPitchStrings()];
    for (const s of strings) expect(s).not.toMatch(/\bbeta\b/i);
  });

  it('has no price, checkout or purchase wording (iOS 3.1.1)', () => {
    const strings = [
      ...Object.values(PREMIUM_PITCH_COPY).filter((s) => s !== PREMIUM_PITCH_COPY.termsBody),
      ...allPitchStrings(),
    ];
    for (const s of strings) expect(s, s).not.toMatch(PRICE_OR_PURCHASE);
    // The terms sentence promises a notice before a price exists; it names no amount or link.
    expect(PREMIUM_PITCH_COPY.termsBody).not.toMatch(/[€$£]|https?:|checkout|subscribe/i);
  });

  it('never carries B-32 phrases or a forbidden claim', () => {
    for (const s of [...Object.values(PREMIUM_PITCH_COPY), ...allPitchStrings()]) {
      expect(s).not.toMatch(/AI meal plans tailored|nutrition profile/i);
      expect(containsForbiddenPhrase(s), s).toBeNull();
    }
  });

  it('the plan matrix no longer headlines "AI meal plans tailored to you" (B-32)', () => {
    expect(PLAN_FEATURES.aiMealPlans.label).not.toMatch(/tailored/i);
  });
});

describe('Snap taste (T-10.6, B-35, AC10)', () => {
  it('shows for a free food-job user', () => {
    expect(showSnapTaste({ isPremium: false, jobs: ['PLAN_MEALS'] })).toBe(true);
    expect(showSnapTaste({ isPremium: false, jobs: ['TRAIN', 'TRACK'] })).toBe(true);
  });
  it('never shows for a gym-only user', () => {
    expect(showSnapTaste({ isPremium: false, jobs: ['TRAIN'] })).toBe(false);
  });
  it('shows nothing while the plan or jobs are unknown, and never on premium', () => {
    expect(showSnapTaste({ isPremium: undefined, jobs: ['PLAN_MEALS'] })).toBe(false);
    expect(showSnapTaste({ isPremium: false, jobs: [] })).toBe(false);
    expect(showSnapTaste({ isPremium: true, jobs: ['PLAN_MEALS'] })).toBe(false);
  });
  it('hasFoodJob reads every food job', () => {
    for (const job of [
      'PLAN_MEALS',
      'HOUSEHOLD',
      'USE_WHAT_I_HAVE',
      'SAVED_RECIPES',
      'TRACK',
    ] as const) {
      expect(hasFoodJob([job])).toBe(true);
    }
    expect(hasFoodJob(['TRAIN'])).toBe(false);
  });
});

describe('downgrade summary (T-10.3, AC7)', () => {
  const none = { members: 0, aiMealPlans: 0, imports: 0, chatMessages: 0, scans: 0 };
  it('lists only the Premium jobs the user used', () => {
    expect(downgradeLosses(none)).toEqual([]);
    expect(downgradeLosses({ ...none, members: 2 })).toEqual([
      'Portions for your table — plans go back to 1 portion',
    ]);
    const all = downgradeLosses({
      members: 1,
      aiMealPlans: 1,
      imports: 1,
      chatMessages: 1,
      scans: 1,
    });
    expect(all).toHaveLength(5);
  });
  it('never lists the user data they keep', () => {
    const all = downgradeLosses({
      members: 1,
      aiMealPlans: 1,
      imports: 1,
      chatMessages: 1,
      scans: 1,
    });
    for (const line of all) expect(line).not.toMatch(/recipes,|ratings|workouts|logs/i);
  });
});
