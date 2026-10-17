import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@chefer/database', () => ({
  prisma: { ingredientImage: { findUnique, upsert } },
}));
vi.mock('../env.js', () => ({
  env: {
    UNSPLASH_ACCESS_KEY: undefined,
    API_PUBLIC_URL: 'https://api.example',
    NODE_ENV: 'production',
    APP_URL: 'https://app.example',
    PORT: 3001,
  },
}));
vi.mock('./static-images.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./static-images.js')>();
  return {
    ...actual,
    loadIngredientImageManifest: () => ({
      version: 1 as const,
      entries: {
        strawberry: {
          file: 'strawberry.webp',
          hash: 'deadbeef',
          names: ['strawberries', 'strawberry'],
          subject: 'strawberries',
          prompt: 'p',
          source: 'pollinations/flux',
          date: '2026-10-07',
        },
      },
    }),
  };
});

const { resolveIngredientImage } = await import('./index');

describe('resolveIngredientImage', () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
  });

  it('returns the vendored image and never touches the cache, even when a Pollinations URL is cached', async () => {
    findUnique.mockResolvedValue({ imageUrl: 'https://image.pollinations.ai/prompt/old' });
    const url = await resolveIngredientImage('Strawberries');
    expect(url).toBe('https://api.example/uploads/ingredients/strawberry.webp?v=deadbeef');
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('serves the cached URL for names without a vendored image', async () => {
    findUnique.mockResolvedValue({ imageUrl: 'https://cdn.example/dragon.jpg' });
    await expect(resolveIngredientImage('Dragon fruit')).resolves.toBe(
      'https://cdn.example/dragon.jpg',
    );
  });

  it('falls back to a generated URL (and caches it) when nothing else matches', async () => {
    findUnique.mockResolvedValue(null);
    const url = await resolveIngredientImage('Dragon fruit');
    expect(url).toContain('image.pollinations.ai');
    expect(upsert).toHaveBeenCalledOnce();
  });
});
