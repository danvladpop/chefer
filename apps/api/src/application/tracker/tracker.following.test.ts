import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, type LoggedMealEntry } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { recipeCopyService } from '../recipe/recipe-copy.service.js';
import { trackerService } from './tracker.service.js';

// INV-5 (PRD §13): "Made it!" on another user's recipe logs YOUR copy — the
// food log never references a row its owner can edit, hide or delete.

const THEIRS = {
  id: 'theirs',
  source: 'MANUAL',
  creatorId: 'maria',
  nutritionInfo: { calories: 480, protein: 22, carbs: 60, fat: 12 },
};
const MY_COPY = { ...THEIRS, id: 'my-copy', creatorId: 'u1', originRecipeId: 'theirs' };

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: { findForWeek: vi.fn().mockResolvedValue(null) },
  dailyLogRepository: {
    findByDate: vi.fn().mockResolvedValue(null),
    mutateDay: vi.fn(),
    mutateDayState: vi.fn(),
  },
  gymProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  weightEntryRepository: { findLatest: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../recipe/recipe-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recipe/recipe-access.js')>()),
  findRecipeVisibleTo: vi.fn(() => Promise.resolve(THEIRS)),
}));

vi.mock('../recipe/recipe-copy.service.js', () => ({
  recipeCopyService: {
    ownedRecipeFor: vi.fn(() =>
      Promise.resolve({ recipe: MY_COPY, copiedFromId: 'theirs', created: true }),
    ),
  },
}));

const USER: UserProfile = {
  id: 'u1',
  email: 'ana@chefer.dev',
  name: null,
  firstName: 'Ana',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

describe('trackerService.logRecipe — Following (INV-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs another user's recipe as the viewer's copy", async () => {
    let written: LoggedMealEntry[] = [];
    vi.mocked(dailyLogRepository.mutateDayState).mockImplementation((_u, _d, mutate) => {
      written = mutate({ entries: [], skippedSlots: [] }).entries;
      return Promise.resolve({} as never);
    });

    await trackerService.logRecipe(USER, '2026-09-30', {
      recipeId: 'theirs',
      mealType: 'dinner',
      portionMultiplier: 1,
    });

    expect(recipeCopyService.ownedRecipeFor).toHaveBeenCalledWith('u1', THEIRS);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ recipeId: 'my-copy', mealType: 'dinner', kcal: 480 });
  });
});
