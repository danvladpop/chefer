import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImagenRateLimitError,
  ImageQuotaExhaustedError,
  ImageStorageError,
} from '../lib/image-gen/errors.js';
import {
  RecipeImageBackfillWorker,
  type BackfillCandidate,
  type RecipeImageBackfillDeps,
} from './recipe-image-backfill.worker.js';

// F3 (2026-10-17): Pollinations images are replaced by Cloudflare ones a few a
// day. Every collaborator is a fake — no live image calls (§8 AI-cost rule).

vi.mock('../lib/env.js', () => ({ env: {} }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const NOW = new Date('2026-10-17T10:00:00Z');
const POLL = (n: number) => `https://image.pollinations.ai/prompt/dish-${n}?seed=${n}`;

function candidate(n: number): BackfillCandidate {
  return { imageUrl: POLL(n), recipeId: `r${n}`, name: `Dish ${n}`, cuisineType: 'Italian' };
}

/** An in-memory store of recipe rows: id → imageUrl, in backfill order. */
function fakeDeps(rows: Record<string, string>, overrides: Partial<RecipeImageBackfillDeps> = {}) {
  const store = new Map(Object.entries(rows));
  let spentToday = 0;
  let backfilledToday = 0;
  const deps: RecipeImageBackfillDeps = {
    findCandidates: vi.fn(async (limit: number, excludeUrls: string[]) => {
      const seen = new Set<string>();
      const out: BackfillCandidate[] = [];
      for (const [id, url] of store) {
        if (!url.includes('image.pollinations.ai') || seen.has(url) || excludeUrls.includes(url))
          continue;
        seen.add(url);
        const n = Number(/dish-(\d+)/.exec(url)![1]);
        out.push({ ...candidate(n), recipeId: id });
      }
      return out.slice(0, limit);
    }),
    countRemaining: vi.fn(
      async () => [...store.values()].filter((u) => u.includes('pollinations')).length,
    ),
    replaceImageUrl: vi.fn(async (oldUrl: string, newUrl: string) => {
      let n = 0;
      for (const [id, url] of store) {
        if (url === oldUrl) {
          store.set(id, newUrl);
          n++;
        }
      }
      return n;
    }),
    backfilledSince: vi.fn(async () => backfilledToday),
    generate: vi.fn(async ({ recipeId }) => {
      spentToday += 104;
      backfilledToday += 1;
      return `https://chefer.example/uploads/recipes/${recipeId}-abc.jpg`;
    }),
    neuronsUsedToday: vi.fn(() => spentToday),
    probeStorage: vi.fn(async () => null),
    config: () => ({
      enabled: true,
      provider: 'cloudflare',
      dailyMax: 40,
      reserveNeurons: 2_000,
      neuronsPerImage: 104,
    }),
    ...overrides,
  };
  return {
    deps,
    store,
    spend: (n: number) => (spentToday = n),
    setBackfilledToday: (n: number) => (backfilledToday = n),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecipeImageBackfillWorker', () => {
  it('replaces every row that shares a Pollinations URL with one generated image', async () => {
    const { deps, store } = fakeDeps({ a: POLL(1), copyOfA: POLL(1), b: POLL(2) });

    await new RecipeImageBackfillWorker(deps).tick(NOW);

    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.generate).toHaveBeenCalledWith({
      recipeId: 'a',
      recipeName: 'Dish 1',
      cuisineType: 'Italian',
    });
    expect(store.get('a')).toBe('https://chefer.example/uploads/recipes/a-abc.jpg');
    expect(store.get('copyOfA')).toBe('https://chefer.example/uploads/recipes/a-abc.jpg');
    expect(store.get('b')).toBe(POLL(2)); // one image per tick
  });

  it('works through the queue tick by tick and stops when nothing is left', async () => {
    const { deps, store } = fakeDeps({ a: POLL(1), b: POLL(2) });
    const worker = new RecipeImageBackfillWorker(deps);

    await worker.tick(NOW);
    await worker.tick(NOW);
    await worker.tick(NOW);

    expect(deps.generate).toHaveBeenCalledTimes(2);
    expect([...store.values()].some((u) => u.includes('pollinations'))).toBe(false);
  });

  it('stops at the daily cap, counted from stored usage so a restart cannot reset it', async () => {
    const { deps, setBackfilledToday } = fakeDeps({ a: POLL(1) });
    setBackfilledToday(40);

    // A fresh instance = a restart: in-memory state is gone, the cap is not.
    await new RecipeImageBackfillWorker(deps).tick(NOW);

    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.backfilledSince).toHaveBeenCalledWith(new Date('2026-10-17T00:00:00Z'));
  });

  it('leaves the neuron reserve to users: no image when it would cut into the last 2,000', async () => {
    const { deps, spend } = fakeDeps({ a: POLL(1) });
    spend(10_000 - 2_000 - 103); // one more image (104) would dip into the reserve

    await new RecipeImageBackfillWorker(deps).tick(NOW);
    expect(deps.generate).not.toHaveBeenCalled();

    spend(10_000 - 2_000 - 104); // exactly fits
    await new RecipeImageBackfillWorker(deps).tick(NOW);
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it('a daily-quota answer pauses the backfill until the next UTC day', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new ImageQuotaExhaustedError('code 3036'))
      .mockResolvedValue('https://chefer.example/uploads/recipes/a-new.jpg');
    const { deps, store } = fakeDeps({ a: POLL(1) }, { generate });
    const worker = new RecipeImageBackfillWorker(deps);

    await worker.tick(NOW);
    await worker.tick(new Date('2026-10-17T23:59:00Z'));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.get('a')).toBe(POLL(1)); // the old image stays until replaced

    await worker.tick(new Date('2026-10-18T00:05:00Z'));
    expect(generate).toHaveBeenCalledTimes(2);
    expect(store.get('a')).toBe('https://chefer.example/uploads/recipes/a-new.jpg');
  });

  it('never pays for an image it cannot store: skips while the store is broken, pauses for the day after a storage error', async () => {
    const probeStorage = vi.fn().mockResolvedValueOnce('uploads/recipes is not writable');
    const generate = vi.fn().mockRejectedValueOnce(new ImageStorageError('EACCES'));
    const { deps } = fakeDeps({ a: POLL(1) }, { probeStorage, generate });
    const worker = new RecipeImageBackfillWorker(deps);

    await worker.tick(NOW); // probe says broken → no call
    expect(generate).not.toHaveBeenCalled();

    await worker.tick(NOW); // probe fine, the store fails after generation
    await worker.tick(new Date('2026-10-17T20:00:00Z'));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('a rate limit or a failing dish never blocks the rest of the queue', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new ImagenRateLimitError(30_000))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValue('https://chefer.example/uploads/recipes/b-new.jpg');
    const { deps, store } = fakeDeps({ a: POLL(1), b: POLL(2) }, { generate });
    const worker = new RecipeImageBackfillWorker(deps);

    for (let i = 0; i < 5; i++) await worker.tick(NOW);

    // a: rate limit (not counted) + 3 failures → skipped; b is replaced next.
    expect(store.get('a')).toBe(POLL(1));
    expect(store.get('b')).toBe('https://chefer.example/uploads/recipes/b-new.jpg');
  });

  it('does nothing when switched off, or when the image provider is not Cloudflare', async () => {
    for (const config of [
      { enabled: false, provider: 'cloudflare' },
      { enabled: true, provider: 'pollinations' },
    ] as const) {
      const { deps } = fakeDeps(
        { a: POLL(1) },
        {
          config: () => ({ ...config, dailyMax: 40, reserveNeurons: 2_000, neuronsPerImage: 104 }),
        },
      );
      await new RecipeImageBackfillWorker(deps).tick(NOW);
      expect(deps.generate).not.toHaveBeenCalled();
      expect(deps.findCandidates).not.toHaveBeenCalled();
    }
  });

  it('never runs two ticks at once', async () => {
    let release!: () => void;
    const generate = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('https://chefer.example/uploads/recipes/a.jpg');
        }),
    );
    const { deps } = fakeDeps({ a: POLL(1), b: POLL(2) }, { generate });
    const worker = new RecipeImageBackfillWorker(deps);

    const first = worker.tick(NOW);
    await worker.tick(NOW);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    release();
    await first;
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
