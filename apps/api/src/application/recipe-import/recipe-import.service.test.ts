import type { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { MockAIService } from '../../lib/ai/mock.js';
import type { CheferizedRecipe, ExtractedRecipe, IAIService } from '../../lib/ai/types.js';
import { headCheckImage } from '../../lib/recipe-import/index.js';
import { findSafetyIssues, RecipeImportService } from './recipe-import.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

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
          create: vi.fn().mockResolvedValue({ id: 'log1' }),
          delete: vi.fn().mockResolvedValue({}),
        },
        ingredientPrice: { findMany: vi.fn().mockResolvedValue([]) },
      };
      p['$transaction'] = vi.fn(async (fn: (tx: unknown) => unknown) => fn(p));
      return p;
    })(),
  };
});

// The AI module validates env at import time — mock it; every test injects
// its own stub IAIService through the constructor anyway.
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));

// Network never happens in tests: the page fetcher + og:image HEAD check are
// stubbed; everything else in lib/recipe-import stays real.
vi.mock('../../lib/recipe-import/index.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/recipe-import/index.js')>();
  return {
    ...mod,
    fetchRecipePage: vi.fn().mockResolvedValue({
      html: '<html><body><h1>Satay</h1><p>500 g chicken, 120 g peanut butter. Grill it. A rich and generous dinner for four people.</p></body></html>',
      finalUrl: 'https://blog.example.com/satay',
    }),
    headCheckImage: vi.fn().mockResolvedValue(false),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const freeUser: UserProfile = {
  id: 'user-free',
  email: 'free@test.dev',
  name: 'Free',
  firstName: 'Free',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const premiumUser: UserProfile = { ...freeUser, id: 'user-prem', planTier: 'PREMIUM' };

const extracted: ExtractedRecipe = {
  name: 'Peanut Chicken Satay',
  description: 'Skewers with peanut sauce.',
  ingredients: [
    { name: 'chicken breast', quantity: 500, unit: 'g' },
    { name: 'peanut butter', quantity: 120, unit: 'g' },
    { name: 'coconut milk', quantity: 200, unit: 'ml' },
  ],
  instructions: ['Marinate.', 'Grill.', 'Serve with sauce.'],
  nutritionInfo: { calories: 460, protein: 38, carbs: 12, fat: 28, fiber: 3 },
  cuisineType: 'Thai',
  dietaryTags: [],
  prepTimeMins: 20,
  cookTimeMins: 10,
  servings: 4,
};

/** A correct adaptation — peanut removed, vegetarian protein swapped in. */
const goodAdaptation: CheferizedRecipe = {
  adapted: {
    ...extracted,
    name: 'Sunflower Tofu Satay',
    ingredients: [
      { name: 'tofu', quantity: 400, unit: 'g' },
      { name: 'sunflower seed butter', quantity: 120, unit: 'g' },
      { name: 'coconut milk', quantity: 200, unit: 'ml' },
    ],
    dietaryTags: ['vegetarian'],
    servings: 2,
  },
  changes: [
    { kind: 'allergen', description: 'Swapped peanut butter for sunflower seed butter' },
    { kind: 'restriction', description: 'Swapped chicken for tofu' },
    { kind: 'servings', description: 'Rescaled from 4 to 2 servings' },
  ],
};

/** The nightmare case: the AI CLAIMS it adapted but the peanut survived. */
const missedPeanutAdaptation: CheferizedRecipe = {
  adapted: {
    ...goodAdaptation.adapted,
    ingredients: [
      { name: 'tofu', quantity: 400, unit: 'g' },
      { name: 'peanut butter', quantity: 120, unit: 'g' }, // still there!
      { name: 'coconut milk', quantity: 200, unit: 'ml' },
    ],
  },
  changes: [{ kind: 'restriction', description: 'Swapped chicken for tofu' }],
};

function makeAi(): IAIService {
  return {
    extractRecipe: vi.fn().mockResolvedValue(extracted),
    cheferizeRecipe: vi.fn().mockResolvedValue(goodAdaptation),
  } as unknown as IAIService;
}

const prefsRepo = (prefs: {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
  servingSize?: number;
}) =>
  ({
    findByUserId: vi.fn().mockResolvedValue({ servingSize: 2, ...prefs }),
  }) as never;

const recipeRepo = () =>
  ({
    createManualRecipe: vi
      .fn()
      .mockImplementation((userId: string, data: Record<string, unknown>) =>
        Promise.resolve({ id: 'recipe-1', creatorId: userId, ...data }),
      ),
  }) as never;

const peanutVegetarian = {
  allergies: ['peanuts'],
  dietaryRestrictions: ['vegetarian'],
  dislikedIngredients: [],
};

const aiCallLog = () =>
  (
    prisma as unknown as {
      aiCallLog: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    }
  ).aiCallLog;

beforeEach(() => {
  aiCallLog().count.mockResolvedValue(0);
  aiCallLog().create.mockClear();
  vi.mocked(headCheckImage).mockResolvedValue(false);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RecipeImportService.preview — quota', () => {
  it('lets a free user run their one daily preview and logs the attempt', async () => {
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    const preview = await service.preview(freeUser, { text: 'A'.repeat(100) });
    expect(preview.original.name).toBe('Peanut Chicken Satay');
    expect(aiCallLog().create).toHaveBeenCalledWith({
      data: { userId: freeUser.id, callType: 'RECIPE_IMPORT' },
    });
  });

  it('refunds the reservation when the preview fails (F-REC-4-2)', async () => {
    const ai = makeAi();
    vi.mocked(ai.extractRecipe).mockRejectedValue(new Error('provider down'));
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(freeUser, { text: 'A'.repeat(100) })).rejects.toBeDefined();
    const log = (prisma as unknown as { aiCallLog: { delete: ReturnType<typeof vi.fn> } })
      .aiCallLog;
    expect(log.delete).toHaveBeenCalledWith({ where: { id: 'log1' } });
  });

  it('blocks the second free preview of the day with an upgrade message', async () => {
    aiCallLog().count.mockResolvedValue(1);
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(freeUser, { text: 'A'.repeat(100) })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('blocks a premium user past 5 imports', async () => {
    aiCallLog().count.mockResolvedValue(5);
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(premiumUser, { text: 'A'.repeat(100) })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });
});

describe('RecipeImportService.preview — extraction + Cheferize', () => {
  it('adapts via the AI and passes the matcher when the adaptation is clean', async () => {
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    const preview = await service.preview(premiumUser, { text: 'A'.repeat(100) });
    expect(preview.via).toBe('text');
    expect(preview.adapted.name).toBe('Sunflower Tofu Satay');
    expect(preview.changes).toHaveLength(3);
    expect(preview.safety).toEqual({ ok: true, issues: [] });
  });

  it('FAILS CLOSED when the AI missed the peanut — matcher overrides the AI', async () => {
    const ai = makeAi();
    (ai.cheferizeRecipe as ReturnType<typeof vi.fn>).mockResolvedValue(missedPeanutAdaptation);
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    const preview = await service.preview(premiumUser, { text: 'A'.repeat(100) });
    expect(preview.safety.ok).toBe(false);
    expect(preview.safety.issues).toContain('peanuts');
  });

  it('rejects content with no recipe (NO_RECIPE_FOUND sentinel)', async () => {
    const ai = makeAi();
    (ai.extractRecipe as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...extracted,
      name: 'NO_RECIPE_FOUND',
    });
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(premiumUser, { text: 'A'.repeat(100) })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('fetches + strips URL sources and carries provenance and og:image', async () => {
    const ai = makeAi();
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    const preview = await service.preview(premiumUser, { url: 'https://blog.example.com/satay' });
    expect(preview.via).toBe('url');
    expect(preview.sourceUrl).toBe('https://blog.example.com/satay');
    // The AI got the stripped page text, not the raw URL.
    const call = (ai.extractRecipe as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      text?: string;
    };
    expect(call.text).toContain('peanut butter');
  });
});

describe('RecipeImportService.save — fail closed', () => {
  it('refuses to save an "adapted" recipe that still violates the allergy', async () => {
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(
      service.save(premiumUser, {
        recipe: missedPeanutAdaptation.adapted,
        variant: 'adapted',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('saves a clean adapted recipe with provenance and a name-seeded image', async () => {
    const repo = recipeRepo();
    const service = new RecipeImportService(makeAi(), repo, prefsRepo(peanutVegetarian));
    const saved = (await service.save(premiumUser, {
      recipe: goodAdaptation.adapted,
      variant: 'adapted',
      sourceUrl: 'https://blog.example.com/satay',
    })) as unknown as { sourceUrl: string; imageUrl: string };
    expect(saved.sourceUrl).toBe('https://blog.example.com/satay');
    expect(saved.imageUrl).toContain('image.pollinations.ai');
  });

  it('uses the og:image only when the HEAD check confirms it serves an image', async () => {
    vi.mocked(headCheckImage).mockResolvedValue(true);
    const repo = recipeRepo();
    const service = new RecipeImportService(makeAi(), repo, prefsRepo(peanutVegetarian));
    const saved = (await service.save(premiumUser, {
      recipe: goodAdaptation.adapted,
      variant: 'adapted',
      ogImageUrl: 'https://cdn.example.com/satay.jpg',
    })) as unknown as { imageUrl: string };
    expect(saved.imageUrl).toBe('https://cdn.example.com/satay.jpg');
  });

  it('allows saving the original even when it contains the allergen (explicit user choice)', async () => {
    const repo = recipeRepo();
    const service = new RecipeImportService(makeAi(), repo, prefsRepo(peanutVegetarian));
    const saved = (await service.save(premiumUser, {
      recipe: extracted,
      variant: 'original',
    })) as unknown as { id: string };
    expect(saved.id).toBe('recipe-1');
  });
});

describe('RecipeImportService.preview — friendly AI failures (§4.5.2)', () => {
  const gemini429 = Object.assign(
    new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'),
    { status: 429 },
  );

  // NOTE: restore only this spy — vi.restoreAllMocks() would wipe the
  // module-level prisma/fetch mock implementations later tests rely on.
  const spyOnConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let consoleSpy: ReturnType<typeof spyOnConsoleError>;
  beforeEach(() => {
    consoleSpy = spyOnConsoleError();
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('maps an extractRecipe 429 to the friendly over-capacity error, not the raw blob', async () => {
    const ai = makeAi();
    (ai.extractRecipe as ReturnType<typeof vi.fn>).mockRejectedValue(gemini429);
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    const rejection = await service.preview(premiumUser, { text: 'A'.repeat(100) }).then(
      () => null,
      (err: TRPCError) => err,
    );
    expect(rejection?.code).toBe('SERVICE_UNAVAILABLE');
    expect(rejection?.message).toMatch(/over capacity/);
    expect(rejection?.message).not.toContain('RESOURCE_EXHAUSTED');
  });

  it('maps a cheferizeRecipe timeout to a friendly error too', async () => {
    const ai = makeAi();
    (ai.cheferizeRecipe as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('fetch failed: request timed out'),
    );
    const service = new RecipeImportService(ai, recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(premiumUser, { text: 'A'.repeat(100) })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: expect.stringMatching(/over capacity/) as string,
    });
  });

  it('leaves the quota TRPCError untouched (its copy is already friendly)', async () => {
    aiCallLog().count.mockResolvedValue(5);
    const service = new RecipeImportService(makeAi(), recipeRepo(), prefsRepo(peanutVegetarian));
    await expect(service.preview(premiumUser, { text: 'A'.repeat(100) })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });
});

describe('RecipeImportService.preview — steered MockAIService end-to-end (§4.5.1)', () => {
  it('the "unsafe" steering keyword drives the P1-2 fail-closed path through the real mock', async () => {
    const service = new RecipeImportService(
      new MockAIService(),
      recipeRepo(),
      prefsRepo(peanutVegetarian),
    );
    const preview = await service.preview(premiumUser, {
      text: 'unsafe satay demo — the adaptation must not be trusted',
    });
    expect(preview.original.name).toMatch(/^UNSAFE/);
    expect(preview.safety.ok).toBe(false);
    expect(preview.safety.issues).toContain('peanuts');
  });

  it('the satay steering keyword yields a clean Cheferized diff with allergen changes', async () => {
    const service = new RecipeImportService(
      new MockAIService(),
      recipeRepo(),
      prefsRepo({ ...peanutVegetarian, dietaryRestrictions: [] }),
    );
    const preview = await service.preview(premiumUser, { text: 'grandma’s chicken satay recipe' });
    expect(preview.changes.some((c) => c.kind === 'allergen')).toBe(true);
    expect(preview.safety).toEqual({ ok: true, issues: [] });
  });
});

describe('findSafetyIssues', () => {
  it('names each violated term', () => {
    const issues = findSafetyIssues(extracted, {
      allergies: ['peanuts', 'shellfish'],
      dietaryRestrictions: ['vegetarian'],
      dislikedIngredients: [],
    });
    expect(issues).toContain('peanuts');
    expect(issues).toContain('vegetarian'); // chicken + no vegetarian tag
    expect(issues).not.toContain('shellfish');
  });
});
