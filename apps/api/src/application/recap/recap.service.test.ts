import { describe, expect, it, vi } from 'vitest';
import { lastCompletedWeekStart, mondayOf } from '@chefer/utils';
import { RecapService } from './recap.service';

vi.mock('../gym/gym-stats.service.js', () => ({ gymStatsService: { weekRecap: vi.fn() } }));
vi.mock('../preferences/preferences.service.js', () => ({
  resolveTargets: (profile: { goal: string | null }) => ({
    effective: { proteinG: 120 },
    source: 'suggested',
    inputs: { goal: profile.goal },
  }),
}));

const USER = 'u1';

function makeService(opts: { goal?: string | null; gym?: unknown } = {}) {
  const logs = {
    findInRange: vi.fn(async () => [
      {
        date: new Date('2026-10-12T00:00:00Z'),
        loggedMeals: [
          { recipeId: 'curry', mealType: 'dinner', slotIndex: 0 },
          { recipeId: 'soup', mealType: 'lunch' },
        ],
        totalProtein: 115,
      },
    ]),
    findRecipeIdsLoggedBefore: vi.fn(async () => new Set(['soup'])),
  };
  const plans = {
    findForWeek: vi.fn(async () => ({
      days: [{ dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'curry' }] }],
    })),
    findRecipesByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, name: `Recipe ${id}` })),
    ),
  };
  const profiles = { findByUserId: vi.fn(async () => ({ goal: opts.goal ?? null })) };
  const gym = { weekRecap: vi.fn(async () => opts.gym ?? null) };
  // The repositories are narrowed to what the service reads.
  const service = new RecapService(logs as never, plans as never, profiles as never, gym as never);
  return { service, logs, plans, gym };
}

describe('week helpers', () => {
  it('last completed week is the Monday before this week', () => {
    expect(lastCompletedWeekStart('2026-10-19')).toBe('2026-10-12'); // a Monday
    expect(lastCompletedWeekStart('2026-10-25')).toBe('2026-10-12'); // a Sunday
    expect(mondayOf('2026-10-15')).toBe('2026-10-12');
  });
});

describe('RecapService.week', () => {
  it('on Monday, recaps last week: cooked from plan, new recipes, no protein without a goal', async () => {
    const { service, logs, gym } = makeService();
    const recap = await service.week(USER, { localDate: '2026-10-19' });
    expect(logs.findInRange).toHaveBeenCalledWith(
      USER,
      new Date('2026-10-12T00:00:00Z'),
      new Date('2026-10-19T00:00:00Z'),
    );
    expect(gym.weekRecap).toHaveBeenCalledWith(USER, '2026-10-12', '2026-10-19');
    expect(recap).toEqual({
      weekStart: '2026-10-12',
      label: '12–18 Oct',
      food: {
        plannedMeals: 1,
        cookedFromPlan: 1,
        newRecipesTried: 1,
        newRecipes: [{ id: 'curry', name: 'Recipe curry' }],
        proteinDays: null,
      },
      gym: null,
      empty: false,
    });
  });

  it('with a goal, counts protein days; gym facts pass through', async () => {
    const gymWeek = { sessions: 3, prCount: 1, prs: [], streakWeeks: 2 };
    const { service } = makeService({ goal: 'GAIN_MUSCLE', gym: gymWeek });
    const recap = await service.week(USER, { weekStart: '2026-10-14' });
    expect(recap.weekStart).toBe('2026-10-12');
    expect(recap.food.proteinDays).toEqual({ hit: 1, logged: 1 });
    expect(recap.gym).toEqual(gymWeek);
  });
});
