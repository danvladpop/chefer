import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithAiCallContext } from './call-context.js';
import { ChainAIService } from './failover.js';
import { DEFAULT_AI_ROUTES } from './routing.js';
import { scoreLiveCall, ShadowRunner } from './shadow.js';
import type { IAIService, MealPlanInput, WeekPlanResponse } from './types.js';
import { logAiUsage } from './usage.js';

// Shadow sampler (research §5.4 step 3). Fixture services only.

const PLAN_INPUT = {
  userId: 'u1',
  dailyCalorieTarget: 2000,
  allergies: ['peanuts'],
  dietaryRestrictions: [],
  mealsPerDay: 1,
} as unknown as MealPlanInput;

const SAFE_PLAN: WeekPlanResponse = { days: [] };

function service(generateMealPlan: IAIService['generateMealPlan']): IAIService {
  return { generateMealPlan } as IAIService;
}

/** Runs scheduled tasks on demand instead of setImmediate. */
function manualScheduler() {
  const tasks: (() => void)[] = [];
  return {
    schedule: (task: () => void) => {
      tasks.push(task);
    },
    flush: async () => {
      while (tasks.length) tasks.shift()!();
      // Let the replay's promises settle.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    size: () => tasks.length,
  };
}

let shadowLines: string[];

beforeEach(() => {
  shadowLines = [];
  vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
    if (typeof line === 'string' && line.startsWith('[ai.shadow]')) shadowLines.push(line);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function setup(
  opts: {
    candidate?: IAIService['generateMealPlan'];
    sample?: number;
    random?: () => number;
    consent?: boolean | (() => Promise<boolean>);
  } = {},
) {
  const scheduler = manualScheduler();
  const candidate = vi.fn(opts.candidate ?? (() => Promise.resolve(SAFE_PLAN)));
  const hasConsent =
    typeof opts.consent === 'function'
      ? opts.consent
      : vi.fn().mockResolvedValue(opts.consent ?? true);
  const runner = new ShadowRunner({
    candidates: new Map([['mealPlan', { chain: 'groq', service: service(candidate) }]]),
    sample: opts.sample ?? 1,
    hasConsent,
    random: opts.random ?? (() => 0),
    schedule: scheduler.schedule,
  });
  const primary = vi.fn().mockResolvedValue(SAFE_PLAN);
  const chain = new ChainAIService({
    providers: {
      gemini: { name: 'gemini', service: service(primary) },
      groq: { name: 'groq', service: service(vi.fn()) },
    },
    routes: DEFAULT_AI_ROUTES,
    shadow: runner,
  });
  return { chain, candidate, primary, scheduler, hasConsent };
}

const premiumUser = { userId: 'u1', premium: true };

describe('ShadowRunner — who is shadowed', () => {
  it('replays a premium, consented user call on the candidate and logs scores', async () => {
    const { chain, candidate, scheduler } = setup();
    await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    expect(candidate).not.toHaveBeenCalled(); // not on the request path
    await scheduler.flush();

    expect(candidate).toHaveBeenCalledWith(PLAN_INPUT);
    expect(shadowLines).toHaveLength(1);
    const record = JSON.parse(shadowLines[0]!.slice('[ai.shadow] '.length));
    expect(record).toMatchObject({
      workload: 'mealPlan',
      op: 'generateMealPlan',
      primary: { servedBy: 'gemini', scores: { schemaValid: true, allergenViolations: 0 } },
      candidate: { chain: 'groq', ok: true, scores: { schemaValid: true } },
    });
  });

  it('never runs for background jobs (no call context)', async () => {
    const { chain, scheduler } = setup();
    await chain.generateMealPlan(PLAN_INPUT);
    expect(scheduler.size()).toBe(0);
  });

  it('never runs for free users', async () => {
    const { chain, scheduler } = setup();
    await runWithAiCallContext({ userId: 'u2', premium: false }, () =>
      chain.generateMealPlan(PLAN_INPUT),
    );
    expect(scheduler.size()).toBe(0);
  });

  it('never runs without AI data consent', async () => {
    const { chain, candidate, scheduler, hasConsent } = setup({ consent: false });
    await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    await scheduler.flush();
    expect(hasConsent).toHaveBeenCalledWith('u1');
    expect(candidate).not.toHaveBeenCalled();
    expect(shadowLines).toHaveLength(0);
  });

  it('treats a failing consent lookup as "no"', async () => {
    const { chain, candidate, scheduler } = setup({
      consent: () => Promise.reject(new Error('db down')),
    });
    await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    await scheduler.flush();
    expect(candidate).not.toHaveBeenCalled();
  });

  it('samples: skips calls whose draw is at or above the sample rate', async () => {
    const { chain, scheduler } = setup({ sample: 0.1, random: () => 0.5 });
    await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    expect(scheduler.size()).toBe(0);
  });

  it('ignores workloads without a shadow route', async () => {
    const { chain, scheduler } = setup();
    await runWithAiCallContext(premiumUser, () =>
      chain.generateMealPlan(PLAN_INPUT).then(() => undefined),
    );
    // Only the mealPlan route is configured; a swap would not be observed.
    expect(scheduler.size()).toBe(1);
  });

  it('caps concurrent replays', async () => {
    const { chain, scheduler } = setup();
    for (let i = 0; i < 5; i++) {
      await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    }
    expect(scheduler.size()).toBe(2);
  });
});

describe('ShadowRunner — never touches the user’s request', () => {
  it('a failing candidate is logged, not thrown', async () => {
    const { chain, scheduler } = setup({
      candidate: () => Promise.reject(new Error('HTTP 429 from groq')),
    });
    const result = await runWithAiCallContext(premiumUser, () =>
      chain.generateMealPlan(PLAN_INPUT),
    );
    expect(result).toBe(SAFE_PLAN);
    await expect(scheduler.flush()).resolves.toBeUndefined();
    const record = JSON.parse(shadowLines[0]!.slice('[ai.shadow] '.length));
    expect(record.candidate).toMatchObject({ ok: false, error: 'HTTP 429 from groq' });
  });

  it('a throwing sampler or scheduler cannot break the call', async () => {
    const runner = new ShadowRunner({
      candidates: new Map([['mealPlan', { chain: 'groq', service: service(vi.fn()) }]]),
      sample: 1,
      hasConsent: () => Promise.resolve(true),
      random: () => {
        throw new Error('rng exploded');
      },
    });
    expect(() =>
      runWithAiCallContext(premiumUser, () =>
        runner.observe({
          workload: 'mealPlan',
          op: 'generateMealPlan',
          input: PLAN_INPUT,
          invoke: () => Promise.resolve(SAFE_PLAN),
          result: SAFE_PLAN,
          servedBy: 'gemini',
          ms: 1,
        }),
      ),
    ).not.toThrow();
  });

  it('the replay runs as a shadow call: usage lines are tagged, no recursion', async () => {
    const usage: string[] = [];
    vi.mocked(console.info).mockImplementation((line: unknown) => {
      if (typeof line === 'string' && line.startsWith('[ai.usage]')) usage.push(line);
      if (typeof line === 'string' && line.startsWith('[ai.shadow]')) shadowLines.push(line);
    });
    const { chain, scheduler } = setup({
      candidate: () => {
        logAiUsage({ provider: 'groq', model: 'm', op: 'generateMealPlan', inputTokens: 9, ms: 1 });
        return Promise.resolve(SAFE_PLAN);
      },
    });
    await runWithAiCallContext(premiumUser, () => chain.generateMealPlan(PLAN_INPUT));
    await scheduler.flush();
    expect(JSON.parse(usage[0]!.slice('[ai.usage] '.length))).toMatchObject({ shadow: true });
    const record = JSON.parse(shadowLines[0]!.slice('[ai.shadow] '.length));
    expect(record.candidate.inputTokens).toBe(9);
  });
});

describe('scoreLiveCall', () => {
  it('scores a live plan against the user’s own allergies', () => {
    const unsafe = {
      days: [
        {
          dayOfWeek: 0,
          meals: [
            {
              type: 'dinner',
              recipe: {
                id: 'r',
                name: 'Satay',
                description: '',
                ingredients: [{ name: 'peanut butter', quantity: 30, unit: 'g' }],
                instructions: [],
                nutritionInfo: { calories: 2000, protein: 1, carbs: 1, fat: 1, fiber: 1 },
                cuisineType: 'x',
                dietaryTags: [],
                prepTimeMins: 1,
                cookTimeMins: 1,
                servings: 1,
                imageUrl: null,
              },
            },
          ],
        },
      ],
    };
    const s = scoreLiveCall({ op: 'generateMealPlan', input: PLAN_INPUT }, unsafe);
    expect(s).toMatchObject({ schemaValid: true, allergenViolations: 1, kcalErrorPct: 0 });
  });

  it('scores annotated extraction on its recipe', () => {
    expect(
      scoreLiveCall({ op: 'extractRecipeAnnotated', input: { text: 'x' } }, { recipe: {} })
        .schemaValid,
    ).toBe(false);
  });
});
