import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chefProfileRepository, dailyLogRepository, mealPlanRepository } from '@chefer/database';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import {
  applyDayFitSuggestion,
  fitPlanDay,
  portionRefitNotice,
  refitAfterTargetChange,
  undoPortionRefit,
} from './day-fit.js';

// Day rebalance (2026-10-16): a swap/replace/log resizes the day's OTHER open
// meals so the day lands on ITS target; past days and the user's picks are
// never touched; a target change resizes the rest of the week with Undo.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  mealPlanRepository: {
    findByIdForUser: vi.fn(),
    findRecipesByIds: vi.fn(),
    findForWeek: vi.fn(),
    setDayPortions: vi.fn(),
    setPortionRefit: vi.fn(),
    updateDayMeal: vi.fn(),
    appendDayMeal: vi.fn(),
  },
  chefProfileRepository: { findByUserId: vi.fn() },
  dailyLogRepository: { findLastN: vi.fn() },
}));

vi.mock('../safety/safety.service.js', () => ({
  safetyService: {
    loadContext: vi.fn().mockResolvedValue({
      prefs: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
      hiddenRecipeIds: [],
    }),
  },
}));

vi.mock('../training-nutrition/training-nutrition.service.js', () => ({
  trainingNutritionService: {
    loadLifter: vi.fn(),
    isBumpWidened: vi.fn().mockResolvedValue(false),
    trainingSchedule: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../lib/curated-recipes/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/curated-recipes/index.js')>()),
  ensureCuratedRecipes: vi.fn().mockResolvedValue(undefined),
}));

// Wednesday 30 Sep 2026 (index 2); the plan's week starts Monday 28 Sep.
const TODAY = '2026-09-30';
const MONDAY = new Date('2026-09-28T00:00:00Z');
const PLAN_ID = 'plan-1';

// A 2,000 kcal / 100 g day: male, 30, 178 cm, 72 kg, light activity, MAINTAIN.
const PROFILE = {
  goal: 'MAINTAIN',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 178,
  weightKg: 72,
  activityLevel: 'SEDENTARY',
  dailyCalorieTarget: 2000,
};

const RECIPES: Record<string, { name: string; kcal: number; protein: number }> = {
  oats: { name: 'Oats', kcal: 450, protein: 20 },
  bowl: { name: 'Chicken Bowl', kcal: 600, protein: 45 },
  salmon: { name: 'Salmon', kcal: 650, protein: 40 },
  soup: { name: 'Miso Soup', kcal: 300, protein: 12 },
  steak: { name: 'Steak Frites', kcal: 1300, protein: 60 },
};

type Slot = { type: string; recipeId: string; portion?: number; pinned?: boolean };

function plan(days: Record<number, Slot[]>, portionRefit: unknown = null) {
  return {
    id: PLAN_ID,
    weekStartDate: MONDAY,
    portionRefit,
    days: Object.entries(days).map(([d, meals]) => ({ dayOfWeek: Number(d), meals })),
  };
}

function setup(
  p: ReturnType<typeof plan>,
  todayLog?: { totalKcal: number; totalProtein: number; loggedMeals: unknown[] },
) {
  vi.mocked(mealPlanRepository.findByIdForUser).mockResolvedValue(p as never);
  vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue(
    Object.entries(RECIPES).map(([id, r]) => ({
      id,
      name: r.name,
      nutritionInfo: { calories: r.kcal, protein: r.protein },
    })) as never,
  );
  vi.mocked(dailyLogRepository.findLastN).mockResolvedValue(
    (todayLog
      ? [{ date: new Date(`${TODAY}T00:00:00Z`), skippedSlots: [], ...todayLog }]
      : []) as never,
  );
}

const day = (dinner: string, extra: Partial<Slot> = {}): Slot[] => [
  { type: 'breakfast', recipeId: 'oats' },
  { type: 'lunch', recipeId: 'bowl' },
  { type: 'dinner', recipeId: dinner, ...extra },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue(PROFILE as never);
  vi.mocked(trainingNutritionService.loadLifter).mockResolvedValue({
    lifterBodyweightKg: null,
  });
  vi.mocked(trainingNutritionService.trainingSchedule).mockResolvedValue([]);
});

describe('fitPlanDay — after a swap', () => {
  it("resizes the day's other open meals around the new pick and writes them", async () => {
    // Thursday: dinner became a 300 kcal soup → the day sits at 1,350.
    setup(plan({ 3: day('soup') }));
    const out = await fitPlanDay('u1', PLAN_ID, 3, { lockSlotIndexes: [2], localDate: TODAY });
    expect(out?.nothingOpen).toBe(false);
    expect(out?.changes.map((c) => c.slotIndex)).not.toContain(2);
    expect(out?.changes.length).toBeGreaterThan(0);
    expect(out?.onTarget).toBe(true);
    const [, , written] = vi.mocked(mealPlanRepository.setDayPortions).mock.calls[0]!;
    expect(written[2]).toBe(1); // the user's pick keeps its portion
    expect(out?.previousPortions).toEqual([1, 1, 1]);
  });

  it('never touches a past day', async () => {
    setup(plan({ 0: day('soup') }));
    expect(await fitPlanDay('u1', PLAN_ID, 0, { localDate: TODAY })).toBeNull();
    expect(mealPlanRepository.setDayPortions).not.toHaveBeenCalled();
  });

  it('pinned slots stay as they are', async () => {
    setup(
      plan({ 3: [{ type: 'breakfast', recipeId: 'oats', pinned: true }, ...day('soup').slice(1)] }),
    );
    const out = await fitPlanDay('u1', PLAN_ID, 3, { lockSlotIndexes: [2], localDate: TODAY });
    expect(out?.changes.map((c) => c.slotIndex)).toEqual([1]);
  });

  it('nothing open left (today: breakfast and lunch eaten, dinner is the pick) → no change', async () => {
    setup(plan({ 2: day('steak') }), {
      totalKcal: 1050,
      totalProtein: 65,
      loggedMeals: [
        { recipeId: 'oats', mealType: 'breakfast', slotIndex: 0 },
        { recipeId: 'bowl', mealType: 'lunch', slotIndex: 1 },
      ],
    });
    const out = await fitPlanDay('u1', PLAN_ID, 2, { lockSlotIndexes: [2], localDate: TODAY });
    expect(out?.nothingOpen).toBe(true);
    expect(out?.changes).toEqual([]);
    expect(out?.kcal).toBe(2350);
    expect(out?.suggestion).toBeNull();
    expect(mealPlanRepository.setDayPortions).not.toHaveBeenCalled();
  });

  it('today: only still-planned meals are resized, eaten food counts from the log', async () => {
    setup(plan({ 2: day('soup') }), {
      totalKcal: 450,
      totalProtein: 20,
      loggedMeals: [{ recipeId: 'oats', mealType: 'breakfast', slotIndex: 0 }],
    });
    const out = await fitPlanDay('u1', PLAN_ID, 2, { lockSlotIndexes: [2], localDate: TODAY });
    expect(out?.changes.map((c) => c.slotIndex)).toEqual([1]);
  });

  it('fits a training day to the bumped target Today shows', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...PROFILE,
      goal: 'GAIN_MUSCLE',
    } as never);
    vi.mocked(trainingNutritionService.loadLifter).mockResolvedValue({
      lifterBodyweightKg: 72,
    });
    vi.mocked(trainingNutritionService.trainingSchedule).mockResolvedValue([
      { plannedWeekday: 3, name: 'Full body' },
    ] as never);
    setup(plan({ 3: day('salmon'), 4: day('salmon') }));
    const thu = await fitPlanDay('u1', PLAN_ID, 3, { localDate: TODAY, suggest: false });
    const fri = await fitPlanDay('u1', PLAN_ID, 4, { localDate: TODAY, suggest: false });
    expect(thu!.targetKcal).toBeGreaterThan(fri!.targetKcal);
  });

  it('suggests one change when portions alone cannot reach the day', async () => {
    // A 2,600 kcal day with two tiny open meals: even 2× soup can't reach it.
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...PROFILE,
      dailyCalorieTarget: 2600,
      weightKg: null,
    } as never);
    setup(
      plan({
        3: [
          { type: 'breakfast', recipeId: 'soup' },
          { type: 'lunch', recipeId: 'soup' },
          { type: 'dinner', recipeId: 'oats' },
        ],
      }),
    );
    const out = await fitPlanDay('u1', PLAN_ID, 3, { lockSlotIndexes: [2], localDate: TODAY });
    expect(out?.onTarget).toBe(false);
    expect(out?.suggestion).not.toBeNull();
    expect(out?.suggestion?.kcalDelta).toBeGreaterThan(0);
    if (out?.suggestion?.kind === 'swap') expect(out.suggestion.slotIndex).not.toBe(2);
  });
});

describe('applyDayFitSuggestion', () => {
  it('refuses a recipe outside the safe curated pool', async () => {
    setup(plan({ 3: day('soup') }));
    const res = await applyDayFitSuggestion('u1', {
      planId: PLAN_ID,
      dayOfWeek: 3,
      kind: 'swap',
      mealType: 'breakfast',
      recipeId: 'not-a-curated-recipe',
      slotIndex: 0,
      localDate: TODAY,
    });
    expect(res).toBeNull();
    expect(mealPlanRepository.updateDayMeal).not.toHaveBeenCalled();
  });
});

describe('refit after a target change', () => {
  it('records what it resized on the plan, and Undo puts it back', async () => {
    vi.mocked(chefProfileRepository.findByUserId).mockResolvedValue({
      ...PROFILE,
      dailyCalorieTarget: 2800,
      weightKg: null,
    } as never);
    const p = plan({ 3: day('salmon'), 4: day('salmon') });
    setup(p);
    vi.mocked(mealPlanRepository.findForWeek).mockImplementation(
      async (_u, monday) => (new Date(monday).getTime() === MONDAY.getTime() ? p : null) as never,
    );
    await refitAfterTargetChange('u1', { localDate: TODAY });
    const [planId, value] = vi.mocked(mealPlanRepository.setPortionRefit).mock.calls[0]!;
    expect(planId).toBe(PLAN_ID);
    expect(value?.days.map((d) => d.dayOfWeek)).toEqual([3, 4]);
    expect(value?.days[0]?.previousPortions).toEqual([1, 1, 1]);

    setup(plan({ 3: day('salmon'), 4: day('salmon') }, value));
    vi.mocked(mealPlanRepository.setDayPortions).mockClear();
    const undone = await undoPortionRefit('u1', PLAN_ID);
    expect(undone.restored).toBe(2);
    expect(vi.mocked(mealPlanRepository.setDayPortions).mock.calls[0]).toEqual([
      PLAN_ID,
      3,
      [1, 1, 1],
    ]);
    expect(mealPlanRepository.setPortionRefit).toHaveBeenLastCalledWith(PLAN_ID, null);
  });

  it('the notice shows for a week, then is forgotten', () => {
    const at = '2026-09-30T08:00:00.000Z';
    const value = { at, days: [{ dayOfWeek: 3, previousPortions: [1] }] };
    expect(portionRefitNotice(value, Date.parse(at) + 1000)).toEqual({ at, days: 1 });
    expect(portionRefitNotice(value, Date.parse(at) + 8 * 86_400_000)).toBeNull();
    expect(portionRefitNotice(null)).toBeNull();
  });
});
