import { prisma } from '@chefer/database';
import { env } from '../env.js';

// ─── Category fallback images ────────────────────────────────────────────────
// Used when no Unsplash API key is configured, or as a last resort.
// Photo IDs are taken from the existing grocery fixture — known to be valid.

const FALLBACK =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&h=120&fit=crop&q=80';

const CATEGORY_FALLBACKS: Record<string, string> = {
  produce: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=120&h=120&fit=crop&q=80',
  proteins:
    'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=120&h=120&fit=crop&q=80',
  dairy: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=120&h=120&fit=crop&q=80',
  grains: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=120&h=120&fit=crop&q=80',
  frozen: FALLBACK,
  other: FALLBACK,
};

// Keyword → category used to pick the right fallback when no API key is present
const KEYWORD_CATEGORY: [string, string][] = [
  ['tomato', 'produce'],
  ['spinach', 'produce'],
  ['onion', 'produce'],
  ['garlic', 'produce'],
  ['lemon', 'produce'],
  ['lime', 'produce'],
  ['avocado', 'produce'],
  ['mushroom', 'produce'],
  ['pepper', 'produce'],
  ['lettuce', 'produce'],
  ['cucumber', 'produce'],
  ['zucchini', 'produce'],
  ['carrot', 'produce'],
  ['broccoli', 'produce'],
  ['celery', 'produce'],
  ['kale', 'produce'],
  ['apple', 'produce'],
  ['banana', 'produce'],
  ['berry', 'produce'],
  ['shallot', 'produce'],
  ['herb', 'produce'],
  ['cilantro', 'produce'],
  ['parsley', 'produce'],
  ['basil', 'produce'],
  ['ginger', 'produce'],
  ['potato', 'produce'],
  ['sweet potato', 'produce'],
  ['asparagus', 'produce'],
  ['cauliflower', 'produce'],
  ['cabbage', 'produce'],
  ['chicken', 'proteins'],
  ['beef', 'proteins'],
  ['salmon', 'proteins'],
  ['tuna', 'proteins'],
  ['egg', 'proteins'],
  ['tofu', 'proteins'],
  ['shrimp', 'proteins'],
  ['turkey', 'proteins'],
  ['pork', 'proteins'],
  ['lamb', 'proteins'],
  ['cod', 'proteins'],
  ['fish', 'proteins'],
  ['prawn', 'proteins'],
  ['steak', 'proteins'],
  ['mince', 'proteins'],
  ['milk', 'dairy'],
  ['cheese', 'dairy'],
  ['yogurt', 'dairy'],
  ['butter', 'dairy'],
  ['cream', 'dairy'],
  ['parmesan', 'dairy'],
  ['mozzarella', 'dairy'],
  ['feta', 'dairy'],
  ['cheddar', 'dairy'],
  ['ricotta', 'dairy'],
  ['rice', 'grains'],
  ['pasta', 'grains'],
  ['flour', 'grains'],
  ['bread', 'grains'],
  ['oat', 'grains'],
  ['quinoa', 'grains'],
  ['lentil', 'grains'],
  ['bean', 'grains'],
  ['oil', 'grains'],
  ['vinegar', 'grains'],
  ['soy', 'grains'],
  ['honey', 'grains'],
  ['almond', 'grains'],
  ['walnut', 'grains'],
  ['cashew', 'grains'],
  ['nut', 'grains'],
  ['chickpea', 'grains'],
  ['coconut', 'grains'],
  ['noodle', 'grains'],
  ['couscous', 'grains'],
  ['barley', 'grains'],
];

function getCategoryFallback(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, cat] of KEYWORD_CATEGORY) {
    if (lower.includes(keyword)) return CATEGORY_FALLBACKS[cat] ?? FALLBACK;
  }
  return FALLBACK;
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
 *   3. Category-based fallback image
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
  const imageUrl = unsplashUrl ?? getCategoryFallback(name);

  // 3. Persist to cache (upsert in case of a race condition)
  await prisma.ingredientImage.upsert({
    where: { ingredientName: normalized },
    create: { ingredientName: normalized, imageUrl },
    update: { imageUrl, resolvedAt: new Date() },
  });

  return imageUrl;
}
