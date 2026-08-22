import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { mealPlanService } from '../meal-plan/meal-plan.service.js';
import { ChatService } from './chat.service.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      aiCallLog: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    },
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
    dietaryPreferencesRepository: {
      findByUserId: vi.fn().mockResolvedValue({
        allergies: ['peanuts'],
        dietaryRestrictions: ['Vegetarian'],
        dislikedIngredients: [],
      }),
    },
    mealRatingRepository: { findSignalsForUser: vi.fn().mockResolvedValue([]) },
  };
});

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

vi.mock('../../lib/quotas.js', () => ({
  assertAiSwapQuota: vi.fn().mockResolvedValue(undefined),
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

const todayIdx = (() => {
  const jsDay = new Date().getDay();
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

  it('free tier is cut off after the daily message limit (matrix-driven)', async () => {
    vi.mocked(prisma.aiCallLog.count).mockResolvedValue(5);
    await expect(service.assertChatQuota(user())).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('premium (and admins) are unlimited — no count query at all', async () => {
    await service.assertChatQuota(user({ planTier: 'PREMIUM' }));
    await service.assertChatQuota(user({ role: 'ADMIN' }));
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
    );
    expect(result).toContain('Grilled Halloumi Bowl');
    expect(result).toContain('Falafel Pita'); // names what it replaced
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
});
