import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import type { WeeklyRecapDto } from '@chefer/types';
import { ShareService } from './share.service';

vi.mock('../../lib/env.js', () => ({
  env: { APP_URL: 'https://chefer.test', API_PUBLIC_URL: undefined },
}));
vi.mock('../gym/gym-stats.service.js', () => ({ gymStatsService: {} }));
vi.mock('../recap/recap.service.js', () => ({ recapService: {} }));
vi.mock('../recipe/recipe-access.js', () => ({ findRecipeVisibleTo: vi.fn() }));

const USER = 'u1';
const RECIPE = {
  id: 'r1',
  name: 'Lemon pasta',
  imageUrl: '/uploads/abc.jpg',
  prepTimeMins: 10,
  cookTimeMins: 15,
  servings: 2,
  nutritionInfo: { calories: 540.4, protein: 21.6, carbs: 70, fat: 18 },
  // Never on a card, whatever the recipe holds.
  allergens: ['tree nuts'],
} as unknown as Recipe;

const RECAP: WeeklyRecapDto = {
  weekStart: '2026-10-12',
  label: '12–18 Oct',
  food: {
    plannedMeals: 14,
    cookedFromPlan: 9,
    newRecipesTried: 2,
    newRecipes: [],
    proteinDays: { hit: 4, logged: 6 },
  },
  gym: { sessions: 3, prCount: 1, prs: [], streakWeeks: 2 },
  empty: false,
};

function makeService() {
  const repo = { create: vi.fn(async () => ({})), findById: vi.fn() };
  const service = new ShareService({
    repo: repo as never,
    findRecipe: vi.fn(async (_u: string, id: string) => (id === 'r1' ? RECIPE : null)),
    gym: {
      sessionShareFacts: vi.fn(async () => ({
        title: 'Upper A',
        localDate: '2026-10-20',
        exercises: 5,
        sets: 16,
        durationMin: 52,
        prs: [{ exerciseName: 'Bench Press', label: '62.5 kg × 5' }],
      })),
    },
    recap: { week: vi.fn(async () => RECAP) },
    newId: () => 'abc123def456ghi789jk',
    appUrl: 'https://chefer.test',
    mediaUrl: 'https://api.chefer.test',
  });
  return { service, repo };
}

const stored = (repo: { create: ReturnType<typeof vi.fn> }) =>
  (repo.create.mock.calls[0] as [{ payload: unknown }])[0].payload;

describe('ShareService.create', () => {
  it('returns the public link and image, and stores only what the card shows', async () => {
    const { service, repo } = makeService();
    const link = await service.create(USER, {
      kind: 'recipe',
      recipeId: 'r1',
      showNutrition: false,
    });
    expect(link).toEqual({
      id: 'abc123def456ghi789jk',
      url: 'https://chefer.test/s/abc123def456ghi789jk',
      imageUrl: 'https://chefer.test/s/abc123def456ghi789jk/image',
    });
    expect(stored(repo)).toEqual({
      kind: 'recipe',
      title: 'Lemon pasta',
      imageUrl: 'https://api.chefer.test/uploads/abc.jpg',
      totalMinutes: 25,
      servings: 2,
    });
  });

  it('nutrition is opt-in', async () => {
    const { service, repo } = makeService();
    await service.create(USER, { kind: 'cook', recipeId: 'r1', showNutrition: true });
    expect(stored(repo)).toMatchObject({ kind: 'cook', nutrition: { kcal: 540, proteinG: 22 } });
  });

  it('a recipe the user may not see cannot be shared', async () => {
    const { service, repo } = makeService();
    await expect(
      service.create(USER, { kind: 'recipe', recipeId: 'private', showNutrition: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('a workout card carries PRs only when asked', async () => {
    const { service, repo } = makeService();
    await service.create(USER, { kind: 'workout', sessionId: 's1', showPrs: false });
    expect(stored(repo)).not.toHaveProperty('prs');
  });

  it('a recap card shows protein days only when picked', async () => {
    const { service, repo } = makeService();
    await service.create(USER, {
      kind: 'recap',
      weekStart: '2026-10-12',
      include: { cooking: true, protein: false, training: true },
    });
    expect(stored(repo)).toEqual({
      kind: 'recap',
      label: '12–18 Oct',
      cooking: { cookedFromPlan: 9, newRecipesTried: 2 },
      training: { sessions: 3, prCount: 1, streakWeeks: 2 },
    });
  });
});
