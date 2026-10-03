import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { splitChatActions } from '@chefer/utils';
import { mealPlanService } from '../meal-plan/meal-plan.service.js';
import { ChatService, localDateInZone, localDayIndexInZone } from './chat.service.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    // Quota reservations run count + create inside an interactive transaction;
    // the tx client is the same mock.
    prisma: (() => {
      const p: Record<string, unknown> = {
        aiCallLog: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({}),
          delete: vi.fn().mockResolvedValue({}),
        },
      };
      p['$transaction'] = vi.fn(async (fn: (tx: unknown) => unknown) => fn(p));
      return p;
    })(),
    chefProfileRepository: {
      findByUserId: vi.fn().mockResolvedValue({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        activityLevel: 'MODERATELY_ACTIVE',
        biologicalSex: 'MALE',
        goal: 'MAINTAIN',
        dailyCalorieTarget: 2500,
      }),
    },
    mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
    // buildContextSummary reads today's log (959e5ee) — must be mocked or the
    // test reaches real Prisma and fails in CI's clean env (no DATABASE_URL).
    dailyLogRepository: { findByDate: vi.fn().mockResolvedValue(null) },
  };
});

// T-BUG-X1: the chat context reads the table's merged safety rules — the
// owner's plus every household member's (here a member's sesame allergy).
vi.mock('../safety/safety.service.js', () => ({
  safetyService: {
    loadContext: vi.fn().mockResolvedValue({
      prefs: {
        allergies: ['peanuts', 'sesame'],
        dietaryRestrictions: ['Vegetarian'],
        dislikedIngredients: [],
        excludeLabelDependent: false,
      },
    }),
  },
}));

vi.mock('../meal-plan/meal-plan.service.js', () => ({
  mealPlanService: {
    getActive: vi.fn().mockResolvedValue(null),
    swapRecipe: vi.fn().mockResolvedValue({
      name: 'Grilled Halloumi Bowl',
      nutritionInfo: { calories: 520, protein: 28, carbs: 40, fat: 26, fiber: 5 },
    }),
  },
}));

vi.mock('../../lib/ai/index.js', () => ({
  aiService: { chat: vi.fn().mockResolvedValue(new ReadableStream()) },
}));

// The real module pulls in env validation (via ingredient-images) — mock it
// like the other service dependencies.
vi.mock('../shopping-list/shopping-list.service.js', () => ({
  shoppingListService: {
    addCustomItems: vi.fn().mockResolvedValue({ added: ['Oat milk', 'Flour'] }),
  },
}));

vi.mock('../../lib/quotas.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/quotas.js')>();
  return { ...mod, reserveAiSwap: vi.fn().mockResolvedValue({ release: vi.fn() }) };
});

// Coach pulls env validation via its Gemini review-text module — mock it like
// the other service dependencies (F1).
vi.mock('../coach/coach.service.js', () => ({
  coachService: {
    getCurrentReview: vi.fn().mockResolvedValue({
      status: 'full',
      review: {
        weekStart: new Date('2026-08-17T00:00:00Z'),
        adherencePct: 71,
        avgDailyKcal: 2100,
        weightTrendKg: -0.2,
        adjustmentKcal: -100,
        savedEur: null,
        reviewText: 'A steady week, chef.\nKeep the dinners light.',
        createdAt: new Date('2026-08-23T12:00:00Z'),
      },
    }),
  },
}));

// Pantry pulls curated pools + price libs — stub the singleton (F3).
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: {
    whatCanIMake: vi
      .fn()
      .mockResolvedValue(
        "From the 2 item(s) in the user's kitchen, the best matches:\n- Halloumi Couscous Bowl",
      ),
  },
}));

// Lifter lookup reads the gym profile + weight log — the fixture user has
// neither (P2-4 follow-up: MAINTAIN lifters get a g/kg rule too).
vi.mock('../training-nutrition/training-nutrition.service.js', () => ({
  trainingNutritionService: {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
  },
}));

// T-21.1: logMeal's own local-day lookup.
vi.mock('../tracker/tracker.service.js', () => ({
  trackerService: {
    logCustomMeal: vi.fn().mockResolvedValue({ log: {}, rebalance: null }),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const user = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  email: 'u1@example.com',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  ...over,
});

const recipe = (name: string, protein: number) => ({
  id: `r-${name}`,
  name,
  description: 'd',
  ingredients: [{ name: 'thing', quantity: 100, unit: 'g' }],
  instructions: ['step'],
  nutritionInfo: { calories: 400, protein, carbs: 40, fat: 12, fiber: 4 },
  cuisineType: 'generic',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 10,
  servings: 2,
  imageUrl: null,
  imageStatus: 'DONE' as const,
});

// T-21.1: `buildContextSummary` now reckons "today" from the user's
// `ChefProfile.timeZone`, falling back to UTC when it's unset (the fixture
// user below has none) — mirror that here instead of the sandbox machine's
// own local day, which can disagree with UTC.
const todayIdx = (() => {
  const jsDay = new Date().getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
})();

const PLAN = {
  planId: 'plan1',
  weekStartDate: new Date(),
  days: [
    {
      dayOfWeek: todayIdx,
      meals: [
        { type: 'breakfast' as const, recipe: recipe('Shakshuka', 18) },
        { type: 'lunch' as const, recipe: recipe('Falafel Pita', 20) },
        { type: 'dinner' as const, recipe: recipe('Mushroom Risotto', 17) },
      ],
    },
  ],
};

describe('ChatService', () => {
  const service = new ChatService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.aiCallLog.count).mockResolvedValue(0);
  });

  it('free tier has no chat — premium-only per-user AI (FORBIDDEN, nothing logged)', async () => {
    await expect(service.chat(user(), [{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prisma.aiCallLog.create).not.toHaveBeenCalled();
  });

  it('premium (and admins) are unlimited — no count query at all', async () => {
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    await service.chat(user({ role: 'ADMIN' }), [{ role: 'user', content: 'hi' }]);
    expect(prisma.aiCallLog.count).not.toHaveBeenCalled();
  });

  it("context summary carries today's real meals, protein totals and safety prefs", async () => {
    const summary = await service.buildContextSummary(user(), PLAN);
    expect(summary).toContain('Shakshuka');
    // 18 + 20 + 17 protein across today's meals
    expect(summary).toContain('55g protein');
    expect(summary).toContain('peanuts');
    expect(summary).toContain('Vegetarian');
  });

  it("T-BUG-X1: the context names a household member's allergy, not just the owner's", async () => {
    const summary = await service.buildContextSummary(user(), PLAN);
    expect(summary).toContain('Allergies (never suggest): peanuts, sesame.');
  });

  it('chat() builds context, logs the CHAT call, and passes tools to the AI', async () => {
    const { aiService } = await import('../../lib/ai/index.js');
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);

    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);

    expect(prisma.aiCallLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', callType: 'CHAT' },
    });
    const context = vi.mocked(aiService.chat).mock.calls[0]![1];
    expect(context.contextSummary).toContain('Falafel Pita');
    expect(context.tools).toBeDefined();

    // The swap tool performs a REAL swap through the meal-plan service.
    const result = await context.tools!.swapMeal({ dayOfWeek: todayIdx, mealType: 'lunch' });
    expect(mealPlanService.swapRecipe).toHaveBeenCalledWith(
      'u1',
      'plan1',
      todayIdx,
      'lunch',
      undefined,
      true,
      undefined,
    );
    expect(result).toContain('Grilled Halloumi Bowl');
    expect(result).toContain('Falafel Pita'); // names what it replaced
  });

  it('refunds the chat message when every provider is out of capacity, not on other errors', async () => {
    const { aiService } = await import('../../lib/ai/index.js');
    vi.mocked(prisma.aiCallLog.create).mockResolvedValue({ id: 'row1' } as never);
    vi.mocked(aiService.chat).mockRejectedValueOnce(
      Object.assign(new Error('daily free allocation used up'), { status: 429 }),
    );
    await expect(
      service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.aiCallLog.delete).toHaveBeenCalledWith({ where: { id: 'row1' } });

    vi.mocked(prisma.aiCallLog.delete).mockClear();
    vi.mocked(aiService.chat).mockRejectedValueOnce(new Error('bad tool args'));
    await expect(
      service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('bad tool args');
    expect(prisma.aiCallLog.delete).not.toHaveBeenCalled();
  });

  describe('swapMeal on a two-snack day (slotIndex, PR #42)', () => {
    const TWO_SNACKS = {
      ...PLAN,
      days: [
        {
          dayOfWeek: 2,
          meals: [
            { type: 'breakfast' as const, recipe: recipe('Oats', 12) },
            { type: 'snack' as const, recipe: recipe('Greek Yogurt', 15) },
            { type: 'lunch' as const, recipe: recipe('Falafel Pita', 20) },
            { type: 'snack' as const, recipe: recipe('Hummus Plate', 8) },
            { type: 'dinner' as const, recipe: recipe('Mushroom Risotto', 17) },
          ],
        },
      ],
    };

    async function tools() {
      const { aiService } = await import('../../lib/ai/index.js');
      vi.mocked(mealPlanService.getActive).mockResolvedValue(TWO_SNACKS);
      await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
      return vi.mocked(aiService.chat).mock.calls[0]![1].tools!;
    }

    it('occurrence 2 swaps the second snack by its slot index', async () => {
      const result = await (
        await tools()
      ).swapMeal({ dayOfWeek: 2, mealType: 'snack', occurrence: 2 });
      expect(mealPlanService.swapRecipe).toHaveBeenCalledWith(
        'u1',
        'plan1',
        2,
        'snack',
        undefined,
        true,
        3,
      );
      expect(result).toContain("Wednesday's second snack (Hummus Plate)");
    });

    it('no occurrence keeps the first snack (as before)', async () => {
      const result = await (await tools()).swapMeal({ dayOfWeek: 2, mealType: 'snack' });
      expect(vi.mocked(mealPlanService.swapRecipe).mock.calls[0]?.[6]).toBeUndefined();
      expect(result).toContain("Wednesday's first snack (Greek Yogurt)");
    });

    it('an occurrence the day does not have answers without swapping or reserving quota', async () => {
      const { reserveAiSwap } = await import('../../lib/quotas.js');
      const result = await (
        await tools()
      ).swapMeal({ dayOfWeek: 2, mealType: 'snack', occurrence: 3 });
      expect(result).toBe('Wednesday has only 2 snack slots — nothing to swap.');
      expect(mealPlanService.swapRecipe).not.toHaveBeenCalled();
      expect(reserveAiSwap).not.toHaveBeenCalled();
    });
  });

  it('scaleRecipe rescales ingredient quantities from the active plan', async () => {
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
    const { aiService } = await import('../../lib/ai/index.js');
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls[0]![1];

    // 2 servings → 4 servings doubles the 100 g line.
    const result = await context.tools!.scaleRecipe({ recipeName: 'risotto', servings: 4 });
    expect(result).toContain('thing: 200 g');
  });

  it('addToShoppingList sanitises items and writes through the shopping-list service', async () => {
    const { shoppingListService } = await import('../shopping-list/shopping-list.service.js');
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
    const { aiService } = await import('../../lib/ai/index.js');
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls[0]![1];

    const result = await context.tools!.addToShoppingList({
      items: [
        { name: '  oat milk ', quantity: 2, unit: 'l' },
        { name: 'flour' }, // no quantity/unit → defaults applied server-side
        { name: '   ' }, // blank → dropped
      ],
    });

    expect(shoppingListService.addCustomItems).toHaveBeenCalledWith('u1', 'plan1', [
      { name: 'oat milk', quantity: 2, unit: 'l' },
      { name: 'flour' },
    ]);
    expect(result).toContain('Oat milk');
  });

  // UX-FOOD-21: an opted-in client gets what the tools did as a trailer after
  // the text, so the app can show "View / Undo" chips; everyone else gets the
  // bare stream, byte for byte.
  describe('action trailer (UX-FOOD-21)', () => {
    async function readAll(stream: ReadableStream): Promise<string> {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let out = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out += typeof value === 'string' ? value : decoder.decode(value as Uint8Array);
      }
    }
    const textStream = (text: string) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });

    it('appends the swap the tool performed, with the id to undo to', async () => {
      const { aiService } = await import('../../lib/ai/index.js');
      vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
      vi.mocked(mealPlanService.swapRecipe).mockResolvedValueOnce({
        name: 'Grilled Halloumi Bowl',
        nutritionInfo: { calories: 520, protein: 28, carbs: 40, fat: 26, fiber: 5 },
        previousRecipeId: 'r-Falafel Pita',
      } as never);
      vi.mocked(aiService.chat).mockImplementationOnce(async (_messages, context) => {
        await context.tools!.swapMeal({ dayOfWeek: todayIdx, mealType: 'lunch' });
        return textStream('Done.');
      });

      const stream = await service.chat(
        user({ planTier: 'PREMIUM' }),
        [{ role: 'user', content: 'swap my lunch' }],
        { withActions: true },
      );
      const { text, actions } = splitChatActions(await readAll(stream));
      expect(text).toBe('Done.');
      expect(actions).toEqual([
        expect.objectContaining({
          kind: 'swap',
          planId: 'plan1',
          dayOfWeek: todayIdx,
          mealType: 'lunch',
          slotIndex: 1,
          previousRecipeId: 'r-Falafel Pita',
        }),
      ]);
    });

    it('reports the shopping-list keys so the app can remove them again', async () => {
      const { aiService } = await import('../../lib/ai/index.js');
      vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
      vi.mocked(aiService.chat).mockImplementationOnce(async (_messages, context) => {
        await context.tools!.addToShoppingList({ items: [{ name: 'Oat milk', unit: 'l' }] });
        return textStream('Added.');
      });
      const stream = await service.chat(
        user({ planTier: 'PREMIUM' }),
        [{ role: 'user', content: 'add oat milk' }],
        { withActions: true },
      );
      const { actions } = splitChatActions(await readAll(stream));
      expect(actions).toEqual([
        expect.objectContaining({ kind: 'shopping', keys: ['plan1-custom-oat-milk-l'] }),
      ]);
    });

    it('a client that did not opt in gets the plain stream, no trailer', async () => {
      const { aiService } = await import('../../lib/ai/index.js');
      vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
      vi.mocked(aiService.chat).mockImplementationOnce(async (_messages, context) => {
        await context.tools!.swapMeal({ dayOfWeek: todayIdx, mealType: 'lunch' });
        return textStream('Done.');
      });
      const stream = await service.chat(user({ planTier: 'PREMIUM' }), [
        { role: 'user', content: 'swap my lunch' },
      ]);
      expect(await readAll(stream)).toBe('Done.');
    });

    it('an opted-in reply with no actions has no trailer either', async () => {
      const { aiService } = await import('../../lib/ai/index.js');
      vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
      vi.mocked(aiService.chat).mockImplementationOnce(async () => textStream('Just chatting.'));
      const stream = await service.chat(
        user({ planTier: 'PREMIUM' }),
        [{ role: 'user', content: 'hi' }],
        { withActions: true },
      );
      expect(await readAll(stream)).toBe('Just chatting.');
    });
  });

  it('addToShoppingList without an active plan does not touch the service', async () => {
    const { shoppingListService } = await import('../shopping-list/shopping-list.service.js');
    vi.mocked(mealPlanService.getActive).mockResolvedValue(null);
    const { aiService } = await import('../../lib/ai/index.js');
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

    const result = await context.tools!.addToShoppingList({ items: [{ name: 'milk' }] });
    expect(result).toContain('generate a plan first');
    expect(shoppingListService.addCustomItems).not.toHaveBeenCalled();
  });

  it('getMyReview surfaces the latest chef review through the coach service (F1)', async () => {
    const { coachService } = await import('../coach/coach.service.js');
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
    const { aiService } = await import('../../lib/ai/index.js');
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

    const result = await context.tools!.getMyReview();

    expect(coachService.getCurrentReview).toHaveBeenCalled();
    expect(result).toContain('adherence 71%');
    expect(result).toContain('-100 kcal');
    expect(result).toContain('A steady week, chef.');
  });

  it('getMyReview for free users returns only the teaser line + upgrade hint', async () => {
    const { coachService } = await import('../coach/coach.service.js');
    vi.mocked(coachService.getCurrentReview).mockResolvedValueOnce({
      status: 'teaser',
      weekStart: new Date('2026-08-17T00:00:00Z'),
      firstLine: 'A steady week, chef.',
      lockedLineCount: 3,
    });
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
    const { aiService } = await import('../../lib/ai/index.js');
    // Chat itself is premium now; the teaser path is driven by the review's
    // own status, which is what this test pins.
    await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

    const result = await context.tools!.getMyReview();

    expect(result).toContain('A steady week, chef.');
    expect(result).not.toContain('Keep the dinners light.');
    expect(result).toMatch(/premium/i);
  });

  it('whatCanIMake answers through the pantry service (F3)', async () => {
    const { pantryService } = await import('../pantry/pantry.service.js');
    vi.mocked(mealPlanService.getActive).mockResolvedValue(PLAN);
    const { aiService } = await import('../../lib/ai/index.js');
    const premium = user({ planTier: 'PREMIUM' });
    await service.chat(premium, [{ role: 'user', content: 'hi' }]);
    const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

    const result = await context.tools!.whatCanIMake();

    expect(pantryService.whatCanIMake).toHaveBeenCalledWith(premium);
    expect(result).toContain('Halloumi Couscous Bowl');
  });

  // ─── T-21.1: one local-day contract (bugs B-06, B-33) ─────────────────────────

  describe('localDateInZone / localDayIndexInZone', () => {
    it('reads the calendar date in the given IANA zone, not UTC', () => {
      // 2026-01-01T02:00:00Z is still 2025-12-31 evening in Los Angeles.
      const utcMidnight = new Date('2026-01-01T02:00:00.000Z');
      expect(localDateInZone('America/Los_Angeles', utcMidnight)).toBe('2025-12-31');
      expect(localDateInZone('UTC', utcMidnight)).toBe('2026-01-01');
    });

    it('falls back to UTC when no time zone is set (unchanged accounts)', () => {
      const d = new Date('2026-03-15T10:00:00.000Z');
      expect(localDateInZone(undefined, d)).toBe(localDateInZone('UTC', d));
      expect(localDateInZone(null, d)).toBe('2026-03-15');
    });

    it('day index is 0=Monday…6=Sunday and follows the local calendar day across midnight', () => {
      // 2026-09-28 is a Monday (UTC). Just after UTC midnight it's still
      // Sunday evening on the US west coast.
      const justAfterUtcMidnight = new Date('2026-09-28T04:00:00.000Z');
      expect(localDayIndexInZone('UTC', justAfterUtcMidnight)).toBe(0); // Monday
      expect(localDayIndexInZone('America/Los_Angeles', justAfterUtcMidnight)).toBe(6); // Sunday
    });
  });

  describe("bug B-06/B-33: logMeal logs to the user's local day, not the server's", () => {
    afterEach(async () => {
      vi.useRealTimers();
      // Restore the describe-block-wide default (no time zone) after a test
      // overrides it — `clearAllMocks` in the outer `beforeEach` clears call
      // history, not a `mockResolvedValue` set here.
      const { chefProfileRepository } = await import('@chefer/database');
      vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        activityLevel: 'MODERATELY_ACTIVE',
        biologicalSex: 'MALE',
        goal: 'MAINTAIN',
        dailyCalorieTarget: 2500,
      } as never);
    });

    it('a message just after UTC midnight logs to the still-Sunday evening in Los Angeles', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-28T04:00:00.000Z')); // Mon 04:00 UTC
      vi.mocked(mealPlanService.getActive).mockResolvedValue(null);
      const { chefProfileRepository } = await import('@chefer/database');
      vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
        timeZone: 'America/Los_Angeles',
      } as never);
      const { trackerService } = await import('../tracker/tracker.service.js');
      const { aiService } = await import('../../lib/ai/index.js');

      await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
      const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

      await context.tools!.logMeal({ name: 'Late snack', kcal: 200, mealType: 'snack' });

      expect(trackerService.logCustomMeal).toHaveBeenCalledWith(
        expect.anything(),
        '2026-09-27', // still Sunday in Los Angeles
        expect.objectContaining({ name: 'Late snack' }),
      );
    });

    it('an account with no saved time zone logs to the UTC day (unchanged behaviour)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
      vi.mocked(mealPlanService.getActive).mockResolvedValue(null);
      const { chefProfileRepository } = await import('@chefer/database');
      vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
        timeZone: null,
      } as never);
      const { trackerService } = await import('../tracker/tracker.service.js');
      const { aiService } = await import('../../lib/ai/index.js');

      await service.chat(user({ planTier: 'PREMIUM' }), [{ role: 'user', content: 'hi' }]);
      const context = vi.mocked(aiService.chat).mock.calls.at(-1)![1];

      await context.tools!.logMeal({ name: 'Lunch', kcal: 500, mealType: 'lunch' });

      expect(trackerService.logCustomMeal).toHaveBeenCalledWith(
        expect.anything(),
        '2026-09-28',
        expect.objectContaining({ name: 'Lunch' }),
      );
    });
  });
});
