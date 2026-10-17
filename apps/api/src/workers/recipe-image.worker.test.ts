import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageStatus, prisma } from '@chefer/database';
import {
  ImagenContentFilterError,
  ImageQuotaExhaustedError,
  ImageStorageError,
} from '../lib/image-gen/errors.js';
import { generateAndUploadRecipeImage, probeRecipeImageStorage } from '../lib/image-gen/index.js';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter.js';
import { RecipeImageWorker } from './recipe-image.worker.js';

// No live image calls (§8 AI-cost rule): the provider is mocked; the error
// classes are the real (env-free) ones.

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
  return {
    ...errors,
    generateAndUploadRecipeImage: vi.fn(),
    probeRecipeImageStorage: vi.fn().mockResolvedValue(null),
  };
});

const RECIPE = { id: 'r1', name: 'Shakshuka', cuisineType: 'Middle Eastern', creatorId: null };
const OTHER = { id: 'r2', name: 'Pad Thai', cuisineType: 'Thai', creatorId: null };

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
  // mockReset: a queue() the worker never claimed must not leak into the next test.
  vi.mocked(prisma.recipe.findMany).mockReset().mockResolvedValue([]);
  vi.mocked(prisma.recipe.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.recipe.update).mockResolvedValue({ imageRetries: 1 } as never);
  vi.mocked(probeRecipeImageStorage).mockResolvedValue(null);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

/** F3 (2026-10-17): no path may write a Pollinations URL any more. */
function expectNoPollinations(): void {
  const writes = JSON.stringify([
    vi.mocked(prisma.recipe.update).mock.calls,
    vi.mocked(prisma.recipe.updateMany).mock.calls,
  ]);
  expect(writes).not.toMatch(/pollinations/i);
}

describe('RecipeImageWorker — generation failures', () => {
  it('a storage failure never regenerates: the recipe waits PENDING while the store is broken', async () => {
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
      data: { imageStatus: ImageStatus.PENDING },
    });
    // No retry counter burned, no FAILED.
    expect(JSON.stringify(updates())).not.toMatch(/imageRetries|FAILED/);

    // While the store stays broken, the next recipe is not generated at all.
    vi.mocked(probeRecipeImageStorage).mockResolvedValue('/app/uploads/recipes is not writable');
    clock += 61_000;
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(1);
    expectNoPollinations();
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

  it('a daily-quota error leaves the recipe PENDING and skips Cloudflare until the next UTC day', async () => {
    vi.mocked(generateAndUploadRecipeImage)
      .mockRejectedValueOnce(new ImageQuotaExhaustedError('code 3036'))
      .mockResolvedValue('https://chefer.example/uploads/recipes/x.jpg');
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();
    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageStatus: ImageStatus.PENDING },
    });

    // Same UTC day: no Cloudflare call at all.
    clock = Date.parse('2026-09-28T23:59:00Z');
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(1);

    // Next UTC day: Cloudflare is tried again.
    clock = Date.parse('2026-09-29T00:01:00Z');
    vi.mocked(prisma.recipe.findMany).mockReset().mockResolvedValue([]);
    queue(OTHER);
    await worker.tick();
    expect(generateAndUploadRecipeImage).toHaveBeenCalledTimes(2);
    expectNoPollinations();
  });

  it('the last retry of a transient failure ends FAILED, never on a Pollinations image', async () => {
    const emit = vi.spyOn(recipeImageEventEmitter, 'emit');
    vi.mocked(generateAndUploadRecipeImage).mockRejectedValueOnce(new Error('HTTP 500'));
    vi.mocked(prisma.recipe.update).mockResolvedValueOnce({ imageRetries: 3 } as never);
    const worker = new RecipeImageWorker(now);

    queue(RECIPE);
    await worker.tick();

    expect(updates()).toContainEqual({
      where: { id: 'r1' },
      data: { imageStatus: ImageStatus.FAILED },
    });
    expect(emit).toHaveBeenCalledWith('r1', { imageUrl: null, status: 'FAILED' });
    expectNoPollinations();
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

describe('RecipeImageWorker.requeueFailedImages', () => {
  it('puts FAILED rows without an image back in the queue with fresh retries', async () => {
    vi.mocked(prisma.recipe.updateMany).mockResolvedValueOnce({ count: 2 });

    await expect(new RecipeImageWorker(now).requeueFailedImages()).resolves.toBe(2);

    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: { imageStatus: ImageStatus.FAILED, imageUrl: null },
      data: { imageStatus: ImageStatus.PENDING, imageRetries: 0 },
    });
    expectNoPollinations();
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
