import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CatalogIngredientRow,
  CuratedDraftPatch,
  CuratedPublishData,
  CuratedRecipeDraft,
  ICuratedRecipeDraftRepository,
} from '@chefer/database';
import { CURATED_INGEST_COPY } from '@chefer/types';
import { computeRecipeNutrition } from '@chefer/utils';
import type { AnnotatedExtraction, ExtractedRecipe } from '../../lib/ai/index.js';
import type { VideoRecipeResult } from '../video-import/video-recipe.service.js';
import {
  CuratedIngestService,
  normaliseCuratedUrl,
  type CuratedIngestDeps,
} from './curated-ingest.service.js';

vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('../../lib/recipe-image-signal.js', () => ({ notifyRecipeImageQueued: vi.fn() }));

// ─── Fakes ───────────────────────────────────────────────────────────────────

function catalogRow(slug: string, name: string, kcal: number, protein = 5): CatalogIngredientRow {
  return {
    id: `ing-${slug}`,
    slug,
    name,
    category: 'OTHER',
    status: 'ACTIVE',
    ownerId: null,
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: 10,
    fatPer100g: 5,
    fiberPer100g: 1,
    sugarPer100g: null,
    satFatPer100g: null,
    sodiumMgPer100g: null,
    densityGPerMl: 1,
    edibleFraction: 1,
    nutritionSource: 'USDA_FDC',
    sourceRef: null,
    imageUrl: null,
    portions: [{ unit: 'piece', grams: 50, source: 'test' }],
    aliases: [],
  } as unknown as CatalogIngredientRow;
}

const CATALOG = [
  catalogRow('egg-whole-raw', 'Egg, whole, raw', 143, 13),
  catalogRow('spinach-raw', 'Spinach, raw', 23, 3),
  catalogRow('olive-oil', 'Olive oil', 884, 0),
  catalogRow('pesto-basil', 'Pesto, basil, with pine nuts and parmesan', 450, 5),
  catalogRow('pasta-dry', 'Pasta, dry', 371, 13),
];
const BY_NAME = new Map<string, CatalogIngredientRow>([
  ['eggs', CATALOG[0]!],
  ['spinach', CATALOG[1]!],
  ['olive oil', CATALOG[2]!],
  ['green sauce', CATALOG[3]!],
  ['pasta', CATALOG[4]!],
]);
const BY_ID = new Map(CATALOG.map((r) => [r.id, r]));

function memoryRepo(): ICuratedRecipeDraftRepository & {
  rows: Map<string, CuratedRecipeDraft>;
  published: CuratedPublishData[];
} {
  const rows = new Map<string, CuratedRecipeDraft>();
  const published: CuratedPublishData[] = [];
  let n = 0;
  const apply = (id: string, patch: CuratedDraftPatch) => {
    const row = rows.get(id)!;
    const next = { ...row, ...patch, updatedAt: new Date() } as CuratedRecipeDraft;
    rows.set(id, next);
    return next;
  };
  return {
    rows,
    published,
    create: async (data) => {
      n += 1;
      const row = {
        id: `d${n}`,
        ...data,
        status: 'EXTRACTING',
        draft: null,
        mealTypes: [],
        proseStatus: 'ORIGINAL',
        assumptions: [],
        notFound: [],
        platform: null,
        creator: null,
        sourceTitle: null,
        transcriptSource: null,
        error: null,
        rejectReason: null,
        recipeId: null,
        reviewedById: null,
        reviewedAt: null,
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CuratedRecipeDraft;
      rows.set(row.id, row);
      return row;
    },
    findById: async (id) => rows.get(id) ?? null,
    findBySourceUrl: async (url) => [...rows.values()].find((r) => r.sourceUrl === url) ?? null,
    list: async () => [...rows.values()],
    countByStatus: async () => ({}),
    countSubmittedSince: async (since) =>
      [...rows.values()].filter((r) => r.submittedAt >= since).length,
    update: async (id, patch) => apply(id, patch),
    updateIfStatus: async (id, from, patch) => {
      const row = rows.get(id);
      if (!row || !from.includes(row.status)) return false;
      apply(id, patch);
      return true;
    },
    publish: async (id, data) => {
      published.push(data);
      const draft = apply(id, {
        status: 'APPROVED',
        draft: data.draft,
        reviewedById: data.reviewedById,
        reviewedAt: new Date(),
      });
      rows.set(id, { ...draft, recipeId: 'recipe-1' });
      return {
        draft: rows.get(id)!,
        recipe: { id: 'recipe-1' } as never,
      };
    },
    findApproved: async () => [],
  };
}

const EXTRACTED: ExtractedRecipe = {
  name: '🔥 VIRAL spinach omelette!!! #breakfast',
  description: 'My go-to breakfast, link in bio',
  ingredients: [
    { name: 'eggs', quantity: 3, unit: 'piece' },
    { name: 'spinach', quantity: 60, unit: 'g' },
    { name: 'olive oil', quantity: 10, unit: 'ml' },
  ],
  instructions: ['whisk the eggs!!', 'wilt the spinach in the oil, add eggs and fold'],
  nutritionInfo: { calories: 999, protein: 1, carbs: 1, fat: 1, fiber: 1 },
  cuisineType: 'French',
  dietaryTags: ['vegan', 'high-protein'],
  prepTimeMins: 5,
  cookTimeMins: 8,
  servings: 1,
};

function videoResult(recipe: ExtractedRecipe = EXTRACTED): VideoRecipeResult {
  return {
    recipe,
    stage: 'caption',
    confidence: 'high',
    assumptions: ['Assumed 1 serving'],
    sourceUrl: 'https://www.youtube.com/shorts/abc123',
    platform: 'youtube',
    title: 'Spinach omelette',
    creator: 'Some Creator',
    thumbnailUrl: null,
    captionChars: 200,
    transcriptChars: 0,
    sourceText: '3 eggs, 60 g spinach, 10 ml olive oil. Whisk the eggs, wilt the spinach, fold.',
  };
}

function makeService(overrides: Partial<CuratedIngestDeps> = {}) {
  const repo = memoryRepo();
  const deps = {
    repo,
    ai: {
      extractRecipeAnnotated: vi.fn<[unknown], Promise<AnnotatedExtraction>>(),
      rewriteRecipeProse: vi.fn().mockResolvedValue({
        name: 'Spinach omelette',
        description: 'A soft, green omelette for busy mornings.',
        instructions: ['Beat the eggs.', 'Wilt the spinach in the oil, pour in the eggs and fold.'],
      }),
    },
    video: { extract: vi.fn().mockResolvedValue(videoResult()) },
    fetchPage: vi.fn(),
    resolver: {
      resolveMany: vi.fn(async (inputs: readonly { rawName: string; unit?: string }[]) =>
        inputs.map((i) => {
          const match = BY_NAME.get(i.rawName.toLowerCase()) ?? null;
          return {
            rawName: i.rawName,
            unit: i.unit ?? '',
            note: null,
            confidence: match ? ('EXACT' as const) : ('NONE' as const),
            match,
            matchedKey: null,
            candidates: [],
          };
        }),
      ),
    },
    nutrition: {
      compute: vi.fn(async (lines, _owner, servings: number) => {
        const rows = new Map<string, CatalogIngredientRow>(
          lines.flatMap((l: { ingredientId: string | null }): [string, CatalogIngredientRow][] => {
            const row = l.ingredientId ? BY_ID.get(l.ingredientId) : undefined;
            return row ? [[row.id, row]] : [];
          }),
        );
        const engine = new Map(
          [...rows].map(([id, r]) => [
            id,
            {
              id,
              kcalPer100g: r.kcalPer100g,
              proteinPer100g: r.proteinPer100g,
              carbsPer100g: r.carbsPer100g,
              fatPer100g: r.fatPer100g,
              fiberPer100g: r.fiberPer100g,
              densityGPerMl: r.densityGPerMl,
              edibleFraction: r.edibleFraction,
              portions: r.portions,
            },
          ]),
        );
        return { result: computeRecipeNutrition(lines, engine, servings), rows };
      }),
    },
    ingredients: {
      findGlobalIdsBySlugs: vi.fn(
        async (slugs: string[]) =>
          new Map(
            slugs.flatMap((s) => {
              const row = CATALOG.find((r) => r.slug === s);
              return row ? [[s, row.id] as const] : [];
            }),
          ),
      ),
      findVisibleByIds: vi.fn(),
    },
    dailyCap: () => 5,
    // Inline, so a test sees the finished extraction.
    runInBackground: (job: () => Promise<void>) => {
      pending.push(job());
    },
    onPoolChanged: vi.fn(),
    onImageQueued: vi.fn(),
    ...overrides,
  };
  const pending: Promise<void>[] = [];
  const service = new CuratedIngestService(deps);
  return {
    service,
    repo,
    deps: deps as CuratedIngestDeps & { ai: { rewriteRecipeProse: ReturnType<typeof vi.fn> } },
    settle: () => Promise.all(pending.splice(0)),
  };
}

const LINK = 'https://www.youtube.com/shorts/abc123?si=tracking#t=3';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normaliseCuratedUrl', () => {
  it('drops the fragment and tracking parameters', () => {
    expect(normaliseCuratedUrl(LINK)).toBe('https://www.youtube.com/shorts/abc123');
    expect(normaliseCuratedUrl('https://x.ro/r?id=5&utm_source=ig')).toBe('https://x.ro/r?id=5');
  });
});

describe('CuratedIngestService.ingest', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it('turns a video link into a DRAFT with rewritten prose and global catalog slugs', async () => {
    const created = await ctx.service.ingest('admin', LINK);
    expect(created.status).toBe('EXTRACTING');
    await ctx.settle();

    const row = ctx.repo.rows.get(created.id)!;
    expect(row.status).toBe('DRAFT');
    expect(row.via).toBe('video');
    expect(row.proseStatus).toBe('REWRITTEN');
    expect(row.mealTypes).toEqual(['breakfast']);
    expect(row.creator).toBe('Some Creator');
    const draft = row.draft as { name: string; ingredients: { slug?: string }[] };
    expect(draft.name).toBe('Spinach omelette');
    expect(draft.ingredients.map((i) => i.slug)).toEqual([
      'egg-whole-raw',
      'spinach-raw',
      'olive-oil',
    ]);
    // Matched against GLOBAL rows only.
    expect(ctx.deps.resolver.resolveMany).toHaveBeenCalledWith(expect.anything(), null, {
      candidates: false,
    });
  });

  it('refuses a link that is already in the queue', async () => {
    await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await expect(
      ctx.service.ingest('admin', 'https://www.youtube.com/shorts/abc123'),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('enforces the daily cap with a clear message', async () => {
    const capped = makeService({ dailyCap: () => 1 });
    await capped.service.ingest('admin', LINK);
    await expect(capped.service.ingest('admin', 'https://example.com/other')).rejects.toMatchObject(
      {
        code: 'TOO_MANY_REQUESTS',
        message: CURATED_INGEST_COPY.dailyCapReached(1),
      },
    );
  });

  it('says plainly when the AI quota is exhausted', async () => {
    const quota = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    const failing = makeService({ video: { extract: vi.fn().mockRejectedValue(quota) } });
    const created = await failing.service.ingest('admin', LINK);
    await failing.settle();
    const row = failing.repo.rows.get(created.id)!;
    expect(row.status).toBe('FAILED');
    expect(row.error).toBe(CURATED_INGEST_COPY.aiQuotaExhausted);
  });

  it('keeps the draft but flags the prose when the rewrite fails', async () => {
    ctx.deps.ai.rewriteRecipeProse.mockRejectedValue(
      new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'busy' }),
    );
    const created = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    const row = ctx.repo.rows.get(created.id)!;
    expect(row.status).toBe('DRAFT');
    expect(row.proseStatus).toBe('ORIGINAL');
    expect(row.assumptions[0]).toContain(CURATED_INGEST_COPY.aiQuotaExhausted);
    await expect(ctx.service.approve('admin', created.id)).rejects.toThrow(
      CURATED_INGEST_COPY.proseNotRewritten,
    );
  });

  it('lets a rejected link be submitted again', async () => {
    const created = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await ctx.service.reject('admin', created.id, 'blurry');
    const again = await ctx.service.ingest('admin', LINK);
    expect(again.id).toBe(created.id);
    expect(again.status).toBe('EXTRACTING');
  });
});

describe('CuratedIngestService.approve', () => {
  it('publishes a CURATED recipe: computed nutrition, catalog lines, derived diet tags, attribution', async () => {
    const ctx = makeService();
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();

    const { recipeId } = await ctx.service.approve('admin-2', id);
    expect(recipeId).toBe('recipe-1');
    const published = ctx.repo.published[0]!;
    expect(published.recipe.sourceUrl).toBe('https://www.youtube.com/shorts/abc123');
    expect(published.lines.map((l) => l.ingredientId)).toEqual([
      'ing-egg-whole-raw',
      'ing-spinach-raw',
      'ing-olive-oil',
    ]);
    expect(published.nutrition.status).toBe('COMPUTED');
    // The extractor's 999 kcal is never stored.
    expect(published.recipe.nutritionInfo).not.toMatchObject({ calories: 999 });
    // "vegan" was claimed on an egg dish: dropped. The proven tags replace it.
    expect(published.recipe.dietaryTags).toContain('vegetarian');
    expect(published.recipe.dietaryTags).not.toContain('vegan');
    expect(published.recipe.dietaryTags).toContain('high-protein');
    expect(published.mealTypes).toEqual(['breakfast']);
    expect(published.reviewedById).toBe('admin-2');
    expect(ctx.deps.onImageQueued).toHaveBeenCalledOnce();
    expect(ctx.deps.onPoolChanged).toHaveBeenCalledOnce();
    expect(ctx.repo.rows.get(id)!.status).toBe('APPROVED');
  });

  it('refuses a draft with an ingredient that is not in the catalog', async () => {
    const ctx = makeService({
      video: {
        extract: vi.fn().mockResolvedValue(
          videoResult({
            ...EXTRACTED,
            ingredients: [
              ...EXTRACTED.ingredients,
              { name: 'unicorn dust', quantity: 1, unit: 'pinch' },
            ],
          }),
        ),
      },
    });
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await expect(ctx.service.approve('admin', id)).rejects.toThrow(
      CURATED_INGEST_COPY.unresolvedLines(['unicorn dust']),
    );
    expect(ctx.repo.published).toHaveLength(0);
  });

  it('refuses a line whose name hides an allergen the catalog row reveals', async () => {
    const ctx = makeService({
      video: {
        extract: vi.fn().mockResolvedValue(
          videoResult({
            ...EXTRACTED,
            name: 'Pasta with green sauce',
            ingredients: [
              { name: 'pasta', quantity: 100, unit: 'g' },
              { name: 'green sauce', quantity: 40, unit: 'g' },
            ],
          }),
        ),
      },
    });
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await ctx.service.update(id, { mealTypes: ['dinner'] });
    const { review } = await ctx.service.get(id);
    expect(review?.hiddenAllergens.map((h) => h.term)).toContain('Tree nuts');
    await expect(ctx.service.approve('admin', id)).rejects.toThrow(/green sauce/);
    expect(ctx.repo.published).toHaveLength(0);
  });

  it('refuses a draft without a meal type', async () => {
    const ctx = makeService();
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await ctx.service.update(id, { mealTypes: [] });
    await expect(ctx.service.approve('admin', id)).rejects.toThrow(CURATED_INGEST_COPY.incomplete);
  });

  it('marks hand-edited prose EDITED, which approval accepts', async () => {
    const ctx = makeService();
    ctx.deps.ai.rewriteRecipeProse.mockRejectedValue(new Error('down'));
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    const row = ctx.repo.rows.get(id)!;
    const draft = row.draft as Parameters<CuratedIngestService['update']>[1]['draft'] & object;
    await ctx.service.update(id, { draft: { ...draft, name: 'Green omelette' } });
    expect(ctx.repo.rows.get(id)!.proseStatus).toBe('EDITED');
    await expect(ctx.service.approve('admin', id)).resolves.toMatchObject({ recipeId: 'recipe-1' });
  });

  it('only reviews drafts waiting for review', async () => {
    const ctx = makeService();
    const { id } = await ctx.service.ingest('admin', LINK);
    await ctx.settle();
    await ctx.service.approve('admin', id);
    await expect(ctx.service.approve('admin', id)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(ctx.service.reject('admin', id, undefined)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await ctx.service.unpublish('admin', id);
    expect(ctx.repo.rows.get(id)!.status).toBe('UNPUBLISHED');
    expect(ctx.deps.onPoolChanged).toHaveBeenCalledTimes(2);
  });
});
