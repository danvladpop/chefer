import { prisma } from '@chefer/database';
import { env } from '../env.js';
import { buildPollinationsUrl } from '../image-gen/pollinations.js';

// ─── Generated fallback ───────────────────────────────────────────────────────
// When Unsplash is unavailable (no key configured — prod's situation — or a
// failed call), generate a per-ingredient photo through Pollinations instead
// of a shared category stock photo. The old category fallbacks left rows of
// identical thumbnails (20 of 37 items shared 3 photos in the E2E sweep —
// prod-followups #6). Deterministic seed per name → the CDN caches it, and
// persisting the URL in IngredientImage stays valid forever.

function generatedIngredientImage(name: string): string {
  const prompt =
    `A clean product photo of ${name}, single food ingredient on a plain light background, ` +
    'top-down, soft natural light, no text, no hands, no packaging branding.';
  return buildPollinationsUrl(prompt, name, 'ingredient', 256, 256);
}

// ─── Unsplash rate-limit guard ───────────────────────────────────────────────
// All Unsplash API calls are serialized through this queue so we never fire
// more than one request at a time, preventing 429s on the 50 req/hr demo tier.
let unsplashQueue: Promise<unknown> = Promise.resolve();

function sanitizeQuery(name: string): string {
  // Remove parenthetical qualifiers: "onion (diced)" → "onion diced"
  return name.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFromUnsplash(name: string): Promise<string | null> {
  if (!env.UNSPLASH_ACCESS_KEY) return null;

  return new Promise((resolve) => {
    unsplashQueue = unsplashQueue.then(async () => {
      try {
        const cleaned = sanitizeQuery(name);
        const query = encodeURIComponent(`${cleaned} food ingredient`);
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${query}&orientation=squarish&per_page=3&content_filter=high`,
          { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY!}` } },
        );

        if (!res.ok) {
          resolve(null);
          return;
        }

        const data = (await res.json()) as {
          results: { urls: { small: string } }[];
        };
        resolve(data.results[0]?.urls.small ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Resolves an image URL for an ingredient name.
 *
 * Resolution order:
 *   1. DB cache (IngredientImage table) — instant, no network call
 *   2. Unsplash search API (if UNSPLASH_ACCESS_KEY is configured)
 *   3. Per-ingredient generated image (Pollinations, keyless)
 *
 * The result is always cached so Unsplash is called at most once per
 * unique ingredient name across all users.
 */
export async function resolveIngredientImage(name: string): Promise<string> {
  const normalized = name.toLowerCase().trim();

  // 1. Cache hit
  const cached = await prisma.ingredientImage.findUnique({
    where: { ingredientName: normalized },
  });
  if (cached) return cached.imageUrl;

  // 2. Unsplash API (if key is present)
  const unsplashUrl = await fetchFromUnsplash(name);
  const imageUrl = unsplashUrl ?? generatedIngredientImage(name);

  // 3. Persist to cache (upsert in case of a race condition)
  await prisma.ingredientImage.upsert({
    where: { ingredientName: normalized },
    create: { ingredientName: normalized, imageUrl },
    update: { imageUrl, resolvedAt: new Date() },
  });

  return imageUrl;
}
