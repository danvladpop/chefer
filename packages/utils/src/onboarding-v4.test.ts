import { describe, expect, it } from 'vitest';
import {
  BISCUIT_LOOP_FRAMES,
  BISCUIT_LOOPS,
  biscuitLoopFrame,
  biscuitShapes,
  type BiscuitNode,
} from './biscuit';
import {
  activityFromTrainingDays,
  eatsEverything,
  EMPTY_SAFETY_VALUE,
  isQuickSafetyOn,
  ONBOARDING_V4_COPY,
  onboardingV4Progress,
  onboardingV4ResumeStep,
  onboardingV4Steps,
  programDaysFromWeekdays,
  toggleQuickSafety,
} from './onboarding-v4';

describe('onboardingV4Steps', () => {
  it('meals + train, free: every step', () => {
    expect(onboardingV4Steps({ jobs: ['PLAN_MEALS', 'TRAIN'], isPremium: false })).toEqual([
      'jobs',
      'goal',
      'aboutYou',
      'safety',
      'building',
      'ready',
      'premium',
      'train',
    ]);
  });

  it('train only skips the food steps', () => {
    expect(onboardingV4Steps({ jobs: ['TRAIN'], isPremium: false })).toEqual([
      'jobs',
      'goal',
      'aboutYou',
      'premium',
      'train',
    ]);
  });

  it('track only asks about food but builds no week', () => {
    expect(onboardingV4Steps({ jobs: ['TRACK'], isPremium: false })).toEqual([
      'jobs',
      'goal',
      'aboutYou',
      'safety',
      'premium',
    ]);
  });

  it('premium users skip the Premium step', () => {
    expect(onboardingV4Steps({ jobs: ['HOUSEHOLD'], isPremium: true })).not.toContain('premium');
  });

  it('progress counts question steps only', () => {
    const steps = onboardingV4Steps({ jobs: ['PLAN_MEALS'], isPremium: false });
    expect(onboardingV4Progress('jobs', steps)).toEqual({ current: 1, total: 4 });
    expect(onboardingV4Progress('safety', steps)).toEqual({ current: 4, total: 4 });
    expect(onboardingV4Progress('ready', steps)).toBeNull();
    const trainOnly = onboardingV4Steps({ jobs: ['TRAIN'], isPremium: false });
    expect(onboardingV4Progress('aboutYou', trainOnly)).toEqual({ current: 3, total: 3 });
  });
});

describe('onboardingV4ResumeStep', () => {
  const all = onboardingV4Steps({ jobs: ['PLAN_MEALS', 'TRAIN'], isPremium: false });

  it('resumes on the saved step', () => {
    expect(onboardingV4ResumeStep('aboutYou', all, false)).toBe('aboutYou');
    expect(onboardingV4ResumeStep('train', all, true)).toBe('train');
  });

  it('rebuilds a plan that never finished, skips the reveal of one that did', () => {
    expect(onboardingV4ResumeStep('building', all, false)).toBe('building');
    expect(onboardingV4ResumeStep('ready', all, false)).toBe('building');
    expect(onboardingV4ResumeStep('ready', all, true)).toBe('premium');
  });

  it('moves past a step that left the flow', () => {
    const premium = onboardingV4Steps({ jobs: ['PLAN_MEALS', 'TRAIN'], isPremium: true });
    expect(onboardingV4ResumeStep('premium', premium, true)).toBe('train');
  });

  it('returns null when nothing is left', () => {
    const food = onboardingV4Steps({ jobs: ['PLAN_MEALS'], isPremium: true });
    expect(onboardingV4ResumeStep('ready', food, true)).toBeNull();
  });
});

describe('activity and program days', () => {
  it('infers activity from training days', () => {
    expect(activityFromTrainingDays(null)).toBe('LIGHTLY_ACTIVE');
    expect(activityFromTrainingDays(0)).toBe('LIGHTLY_ACTIVE');
    expect(activityFromTrainingDays(3)).toBe('MODERATELY_ACTIVE');
    expect(activityFromTrainingDays(5)).toBe('VERY_ACTIVE');
    expect(activityFromTrainingDays(7)).toBe('ATHLETE');
  });

  it('clamps program days to what the API takes', () => {
    expect(programDaysFromWeekdays([])).toBe(3);
    expect(programDaysFromWeekdays([0])).toBe(2);
    expect(programDaysFromWeekdays([0, 2, 4])).toBe(3);
    expect(programDaysFromWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe(6);
  });
});

describe('quick safety chips', () => {
  it('starts as "I eat everything" and toggles allergies on and off', () => {
    expect(eatsEverything(EMPTY_SAFETY_VALUE)).toBe(true);
    const withFish = toggleQuickSafety(EMPTY_SAFETY_VALUE, 'fish');
    expect(isQuickSafetyOn(withFish, 'fish')).toBe(true);
    expect(withFish.allergies).toHaveLength(2);
    expect(eatsEverything(withFish)).toBe(false);
    const off = toggleQuickSafety(withFish, 'fish');
    expect(eatsEverything(off)).toBe(true);
  });

  it('a base diet is single-choice', () => {
    const veg = toggleQuickSafety(EMPTY_SAFETY_VALUE, 'vegetarian');
    const vegan = toggleQuickSafety(veg, 'vegan');
    expect(isQuickSafetyOn(vegan, 'vegan')).toBe(true);
    expect(isQuickSafetyOn(vegan, 'vegetarian')).toBe(false);
  });

  it('keeps answers set elsewhere (More options)', () => {
    const more = { ...EMPTY_SAFETY_VALUE, allergies: ['Sesame'] };
    const both = toggleQuickSafety(more, 'peanuts');
    expect(both.allergies).toEqual(expect.arrayContaining(['Sesame']));
    expect(isQuickSafetyOn(both, 'peanuts')).toBe(true);
  });
});

function numbers(nodes: BiscuitNode[]): number[] {
  const out: number[] = [];
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n)) {
      if (typeof v === 'number') out.push(v);
      if (k === 'children') out.push(...numbers(v as BiscuitNode[]));
      if (typeof v === 'string' && /NaN|Infinity/.test(v)) out.push(Number.NaN);
    }
  }
  return out;
}

describe('Biscuit', () => {
  it('draws every pose without NaN', () => {
    for (const pose of ['lie', 'stand', 'push', 'squat', 'proud', 'wink'] as const) {
      const shapes = biscuitShapes({ pose, accessory: 'crown', holding: 'carrot' }, 12);
      expect(shapes.length).toBeGreaterThan(1);
      expect(numbers(shapes).every(Number.isFinite)).toBe(true);
    }
  });

  it.each(BISCUIT_LOOPS)('loop "%s" is finite and seamless', (loop) => {
    for (let f = 0; f < BISCUIT_LOOP_FRAMES; f += 7) {
      const frame = biscuitLoopFrame(loop, f);
      const all = [...frame.behind, ...biscuitShapes(frame.props, f), ...frame.front];
      expect(numbers(all).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(frame.dy) && Number.isFinite(frame.scaleX)).toBe(true);
    }
    const first = biscuitLoopFrame(loop, 0);
    const wrapped = biscuitLoopFrame(loop, BISCUIT_LOOP_FRAMES);
    expect(wrapped).toEqual(first);
  });

  it('a seamless loop body repeats after one loop', () => {
    const a = biscuitShapes(
      { pose: 'stand', tailWag: 0.7, loop: BISCUIT_LOOP_FRAMES, blink: false },
      3,
    );
    const b = biscuitShapes(
      { pose: 'stand', tailWag: 0.7, loop: BISCUIT_LOOP_FRAMES, blink: false },
      3 + BISCUIT_LOOP_FRAMES,
    );
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('copy', () => {
  it('pluralises the list count and greets by name', () => {
    expect(ONBOARDING_V4_COPY.readyList(1)).toBe('1 item on your list');
    expect(ONBOARDING_V4_COPY.readyList(23)).toBe('23 items on your list');
    expect(ONBOARDING_V4_COPY.doneTitle('Dana')).toBe('You’re all set, Dana!');
    expect(ONBOARDING_V4_COPY.doneTitle(null)).toBe('You’re all set!');
  });
});
