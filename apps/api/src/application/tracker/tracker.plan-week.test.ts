import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, mealPlanRepository } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { rebalanceWeek } from '../meal-plan/rebalance.js';
import { trackerService } from './tracker.service.js';

// UX-FOOD-02 / UX-PLAN-09: the tracker and the post-log rebalance used to read
// `findActiveWithDays` — the newest ACTIVE plan of ANY week — so once the user
// opened next week (which creates a carry-forward plan) they got NEXT week's
// meals as today's. They resolve the plan by week now.

const THIS_MONDAY = new Date('2026-09-28T00:00:00Z');
const NEXT_MONDAY = new Date('2026-10-05T00:00:00Z');

const planOf = (id: string, weekStartDate: Date, recipeId: string) => ({
  id,
  weekStartDate,
  // Friday 2026-10-02 (this week) and Friday 2026-10-09 (next) → dayOfWeek 4.
  days: [{ dayOfWeek: 4, meals: [{ type: 'dinner', recipeId }] }],
});
const PLANS = [
  planOf('plan-this-week', THIS_MONDAY, 'oatmeal'),
  planOf('plan-next-week', NEXT_MONDAY, 'salmon'),
];

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    // The old, wrong lookup: the NEWEST active plan of any week.
    findActiveWithDays: vi.fn(),
    findForWeek: vi.fn(),
    findRecipesByIds: vi.fn(),
  },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue(null),
    mutateDay: vi.fn(),
  },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../meal-plan/rebalance.js', () => ({
  rebalanceWeek: vi.fn().mockResolvedValue({ rebalanced: false, swaps: [], projectedDeviation: 0 }),
}));

const RECIPES = [
  { id: 'oatmeal', name: 'Savory Oatmeal', imageUrl: null, nutritionInfo: { calories: 300 } },
  { id: 'salmon', name: 'Herb Salmon', imageUrl: null, nutritionInfo: { calories: 600 } },
];

const user = (planTier: 'FREE' | 'PREMIUM'): UserProfile => ({
  id: 'u1',
  email: 'plan-week@chefer.dev',
  name: null,
  firstName: 'Alice',
  role: 'USER',
  planTier,
  image: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  // A faithful fake of the repository: only the plan whose week starts within
  // the requested calendar day comes back (findByWeekStart's window).
  vi.mocked(mealPlanRepository.findForWeek).mockImplementation(async (_userId, weekStart) => {
    const dayStart = new Date(weekStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return (PLANS.find((p) => p.weekStartDate >= dayStart && p.weekStartDate < dayEnd) ??
      null) as never;
  });
  // The bug: the newest active plan is next week's.
  vi.mocked(mealPlanRepository.findActiveWithDays).mockResolvedValue(PLANS[1] as never);
  vi.mocked(mealPlanRepository.findRecipesByIds).mockImplementation(
    async (ids: string[]) => RECIPES.filter((r) => ids.includes(r.id)) as never,
  );
});

describe('trackerService.getDay — two ACTIVE plans in adjacent weeks (UX-FOOD-02)', () => {
  it("lists THIS week's Friday, not next week's, for this week's Friday", async () => {
    const day = await trackerService.getDay('u1', '2026-10-02');
    expect(day.plannedMeals.map((m) => m.recipeName)).toEqual(['Savory Oatmeal']);
    expect(day.hasActivePlan).toBe(true);
    expect(mealPlanRepository.findActiveWithDays).not.toHaveBeenCalled();
  });

  it("shows next week's meals only for a date in next week", async () => {
    const day = await trackerService.getDay('u1', '2026-10-09');
    expect(day.plannedMeals.map((m) => m.recipeName)).toEqual(['Herb Salmon']);
  });

  it('Sunday belongs to the week that started the Monday before', async () => {
    // 2026-10-04 is a Sunday → week of 28 Sep, which has nothing on dayOfWeek 6.
    const day = await trackerService.getDay('u1', '2026-10-04');
    expect(day.plannedMeals).toEqual([]);
    expect(day.hasActivePlan).toBe(true);
    expect(vi.mocked(mealPlanRepository.findForWeek).mock.calls[0]![1]).toEqual(THIS_MONDAY);
  });

  it('a date in a week without a plan has no plan (and is not handed another week)', async () => {
    const day = await trackerService.getDay('u1', '2026-10-16');
    expect(day.plannedMeals).toEqual([]);
    expect(day.hasActivePlan).toBe(false);
  });

  it("off-plan detection keys off this week's plan: a logged recipe from next week's plan is off-plan", async () => {
    vi.mocked(dailyLogRepository.findByDate).mockResolvedValue({
      id: 'log1',
      userId: 'u1',
      date: new Date('2026-10-02T00:00:00Z'),
      loggedMeals: [
        {
          entryId: 'e1',
          recipeId: 'salmon',
          mealType: 'dinner',
          portionMultiplier: 1,
          kcal: 600,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
      ],
      skippedSlots: [],
      totalKcal: 600,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      updatedAt: new Date(),
    });
    const day = await trackerService.getDay('u1', '2026-10-02');
    expect(day.offPlanLogged.map((m) => m.recipeId)).toEqual(['salmon']);
    expect(day.offPlanLogged[0]!.entryId).toBe('e1');
  });
});

describe('trackerService.upsertDay — planned-recipe ids come from the right week', () => {
  it("merges against this week's plan", async () => {
    vi.mocked(dailyLogRepository.mutateDay).mockResolvedValue({} as never);
    await trackerService.upsertDay(user('FREE'), '2026-10-02', []);
    expect(vi.mocked(mealPlanRepository.findForWeek).mock.calls[0]![1]).toEqual(THIS_MONDAY);
    expect(mealPlanRepository.findActiveWithDays).not.toHaveBeenCalled();
  });
});

describe('trackerService.maybeRebalance — acts on the current week (UX-PLAN-09)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rebalances this week's plan even though next week's is the newest ACTIVE one", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0, 0)); // Friday 2 Oct 2026
    await trackerService.maybeRebalance(user('PREMIUM'));
    expect(rebalanceWeek).toHaveBeenCalledWith('u1', 'plan-this-week');
    expect(mealPlanRepository.findActiveWithDays).not.toHaveBeenCalled();
  });

  it('does nothing when the current week has no plan, instead of rebalancing next week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0, 0)); // a week with no plan
    const result = await trackerService.maybeRebalance(user('PREMIUM'));
    expect(result).toBeNull();
    expect(rebalanceWeek).not.toHaveBeenCalled();
  });

  it('free users are never rebalanced', async () => {
    await trackerService.maybeRebalance(user('FREE'));
    expect(rebalanceWeek).not.toHaveBeenCalled();
  });
});
