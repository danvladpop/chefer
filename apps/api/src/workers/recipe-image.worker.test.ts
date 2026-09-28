import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageStatus, prisma } from '@chefer/database';
import {
  ImagenContentFilterError,
  ImageQuotaExhaustedError,
  ImageStorageError,
} from '../lib/image-gen/errors.js';
import { generateAndUploadRecipeImage, probeRecipeImageStorage } from '../lib/image-gen/index.js';
import { recipeImageFallbackUrl } from '../lib/image-gen/pollinations.js';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter.js';
import { RecipeImageWorker } from './recipe-image.worker.js';

// No live image calls (§8 AI-cost rule): the provider is mocked; the error
// classes and the Pollinations URL builder are the real (env-free) ones.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      recipe: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ imageRetries: 1 }),
      },
      aiCallLog: { create: vi.fn().mockResolvedValue({}) },
    },
  };
});

vi.mock('../lib/image-gen/index.js', async () => {
  const errors = await vi.importActual<typeof import('../lib/image-gen/errors.js')>(
    '../lib/image-gen/errors.js',
  );
  const pollinations = await vi.importActual<typeof import('../lib/image-gen/pollinations.js')>(
    '../lib/image-gen/pollinations.js',
  );
  return {
    ...errors,
    recipeImageFallbackUrl: pollinations.recipeImageFallbackUrl,
    generateAndUploadRecipeImage: vi.fn(),
    probeRecipeImageStorage: vi.fn().mockResolvedValue(null),
  };
});

const RECIPE = { id: 'r1', name: 'Shakshuka', cuisineType: 'Middle Eastern', creatorId: null };
const OTHER = { id: 'r2', name: 'Pad Thai', cuisineType: 'Thai', creatorId: null };
const FALLBACK = recipeImageFallbackUrl(RECIPE.name, RECIPE.cuisineType);

/** The next claim pass returns these recipes once, then the queue is empty. */
function queue(...recipes: (typeof RECIPE)[]) {
  vi.mocked(prisma.recipe.findMany).mockResolvedValueOnce(recipes as never);
}

/** Every prisma.recipe.update data payload, in call order. */
function updates(): unknown[] {
  return vi.mocked(prisma.recipe.update).mock.calls.map(([arg]) => arg);
}

let clock = Date.parse('2026-09-28T10:00:00Z');
const now = () => clock;

beforeEach(() => {
  vi.clearAllMocks();
  clock = Date.parse('2026-09-28T10:00:00Z');
  vi.mocked(prisma.recipe.findMany).mockResolvedValue([]);
  vi.mocked(prisma.recipe.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.recipe.update).mockResolvedValue({ imageRetries: 1 } as never);
  vi.mocked(probeRecipeImageStorage).mockResolvedValue(null);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('RecipeImageWorker — generation failures', () => {
  it('a storage failure never regenerates: one generate call, then the Pollinations fallback', async () => {
    const emit = vi.spyOn(recipeImageEventEmitter, 'emit');
    vi.mocked(generateAndUploadRecipeImage).mockRejectedValueOnce(
      new ImageStorageError(
        "Could not write /app/uploads/recipes/r1-abc.jpg: EACCES: permission denied, mkdir '/app/uploads/recipes'",
      ),
    );
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();

    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(1);
    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageUrl: FALLBACK, imageStatus: ImageStatus.DONE },
    });
    // No retry counter, no PENDING reset, no FAILED.
    expect(JSON.stringify(updates())).not.toMatch(/imageRetries|PENDING|FAILED/);
    expect(emit).toHaveBeenCalledWith('r1', { imageUrl: FALLBACK, status: 'DONE' });

    // While the store stays broken, the next recipe is not generated at all.
    vi.mocked(probeRecipeImageStorage).mockResolvedValue('/app/uploads/recipes is not writable');
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(1);
    expect(updates()).toContainEqual({
      where: { id: 'r2' },
      data: {
        imageUrl: recipeImageFallbackUrl(OTHER.name, OTHER.cuisineType),
        imageStatus: ImageStatus.DONE,
      },
    });
  });

  it('resumes generation once the store is writable again (re-probed after a minute)', async () => {
    vi.mocked(generateAndUploadRecipeImage)
      .mockRejectedValueOnce(new ImageStorageError('EACCES'))
      .mockResolvedValueOnce('https://chefer.example/uploads/recipes/r2-abc.jpg');
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();
    clock += 61_000; // probe mock answers null (writable)
    queue(OTHER);
    await worker.tick();

    expect(probeRecipeImageStorage).toHaveBeenCalled();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(2);
  });

  it('a daily-quota error falls back and skips Cloudflare for the rest of the UTC day', async () => {
    vi.mocked(generateAndUploadRecipeImage)
      .mockRejectedValueOnce(new ImageQuotaExhaustedError('code 3036'))
      .mockResolvedValue('https://chefer.example/uploads/recipes/x.jpg');
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();
    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageUrl: FALLBACK, imageStatus: ImageStatus.DONE },
    });

    // Same UTC day: no Cloudflare call at all.
    clock = Date.parse('2026-09-28T23:59:00Z');
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(1);

    // Next UTC day: Cloudflare is tried again.
    clock = Date.parse('2026-09-29T00:01:00Z');
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(2);
  });

  it('the last retry of a transient failure ends DONE on the fallback, not FAILED', async () => {
    vi.mocked(generateAndUploadRecipeImage).mockRejectedValueOnce(new Error('HTTP 500'));
    vi.mocked(prisma.recipe.update).mockResolvedValueOnce({ imageRetries: 3 } as never);
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();

    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageUrl: FALLBACK, imageStatus: ImageStatus.DONE },
    });
    expect(JSON.stringify(updates())).not.toMatch(/FAILED/);
  });

  it('an earlier transient failure still goes back to PENDING for a retry', async () => {
    vi.mocked(generateAndUploadRecipeImage).mockRejectedValueOnce(new Error('HTTP 500'));
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();

    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageStatus: ImageStatus.PENDING },
    });
  });

  it('a content-filter refusal stays FAILED', async () => {
    vi.mocked(generateAndUploadRecipeImage).mockRejectedValueOnce(new ImagenContentFilterError());
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();

    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageStatus: ImageStatus.FAILED },
    });
  });
});

describe('RecipeImageWorker.backfillFailedImages', () => {
  it('only touches FAILED rows without an image, with a per-row guard', async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValueOnce([
      { id: 'a', name: 'Shakshuka', cuisineType: 'Middle Eastern' },
      { id: 'b', name: 'Pad Thai', cuisineType: 'Thai' },
    ] as never);

    const count = await new RecipeImageWorker(now).backfillFailedImages();

    expect(count).toBe(2);
    expect(vi.mocked(prisma.recipe.findMany).mock.calls[0]![0]).toMatchObject({
      where: { imageStatus: ImageStatus.FAILED, imageUrl: null },
    });
    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', imageStatus: ImageStatus.FAILED, imageUrl: null },
      data: { imageUrl: FALLBACK, imageStatus: ImageStatus.DONE },
    });
    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: { id: 'b', imageStatus: ImageStatus.FAILED, imageUrl: null },
      data: {
        imageUrl: recipeImageFallbackUrl('Pad Thai', 'Thai'),
        imageStatus: ImageStatus.DONE,
      },
    });
  });

  it('is idempotent: rows already changed elsewhere count zero and stop the loop', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i}`,
      name: 'Soup',
      cuisineType: 'French',
    }));
    // Always the same full batch, but the guard matches nothing.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue(full as never);
    vi.mocked(prisma.recipe.updateMany).mockResolvedValue({ count: 0 });

    await expect(new RecipeImageWorker(now).backfillFailedImages()).resolves.toBe(0);
    expect(prisma.recipe.findMany).toHaveBeenCalledTimes(1);
  });

  it('never crashes boot when the database is not ready', async () => {
    vi.mocked(prisma.recipe.updateMany).mockRejectedValue(new Error('db down'));
    vi.mocked(prisma.recipe.findMany).mockRejectedValue(new Error('db down'));
    const worker = new RecipeImageWorker(now);

    await expect(worker.start()).resolves.toBeUndefined();
    await worker.stop();
  });

  it('reports an unwritable store loudly at startup', async () => {
    vi.mocked(probeRecipeImageStorage).mockResolvedValue(
      '/app/uploads/recipes is not writable: EACCES',
    );
    const worker = new RecipeImageWorker(now);

    await worker.start();
    await worker.stop();

    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/IMAGE STORAGE NOT WRITABLE/));
  });
});
