import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingredientLookupKeys, normalizeIngredientKey } from '@chefer/utils';

// ─── Vendored ingredient thumbnails ──────────────────────────────────────────
// Pre-rendered 256×256 webp product shots shipped with the API
// (apps/api/static/ingredients, produced by scripts/ingredient-images/vendor.ts)
// and served by Express under /uploads/ingredients — a path Caddy already
// forwards to the API, so no proxy change is needed. They replace the on-demand
// Pollinations URLs, whose cold renders fail (HTTP 402) or time out on phones
// and left blank thumbnails on the shopping list (FB7-10).
//
// The manifest is keyed by the shopping-list canonical key (catalog slug as a
// key, else ingredientBaseKey) and lists the display names seen for it, so the
// name the resolver is given ("Strawberries") finds its image.

export const INGREDIENT_STATIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../static/ingredients',
);
export const INGREDIENT_STATIC_ROUTE = '/uploads/ingredients';

export type IngredientImageManifestEntry = {
  /** File name inside static/ingredients. */
  file: string;
  /** Content hash prefix: the cache-buster (`?v=`) appended to the public URL. */
  hash: string;
  /** Normalized display names (ingredientLookupKeys form) that map to this image. */
  names: string[];
  /** Subject drawn and prompt used (provenance, for re-rendering). */
  subject: string;
  prompt: string;
  source: string;
  date: string;
};

export type IngredientImageManifest = {
  version: 1;
  entries: Record<string, IngredientImageManifestEntry>;
};

export type StaticIngredientImages = {
  /** Public URL for an ingredient name, or null when no vendored image covers it. */
  urlFor(name: string): string | null;
  size: number;
};

/**
 * Indexes a manifest for lookups. Exact display names are registered before
 * the canonical keys, so a generic key never shadows a specific name; the first
 * registration of a name wins. Lookup tries the name's candidate keys
 * (ingredientLookupKeys: whole name, then singular / prep-stripped forms).
 */
export function createStaticIngredientImages(
  manifest: IngredientImageManifest,
  publicBaseUrl: string,
): StaticIngredientImages {
  const base = publicBaseUrl.replace(/\/+$/, '');
  const index = new Map<string, string>();
  const urls = new Map<string, string>();
  const entries = Object.entries(manifest.entries);

  for (const [key, entry] of entries) {
    urls.set(key, `${base}${INGREDIENT_STATIC_ROUTE}/${entry.file}?v=${entry.hash}`);
  }
  for (const [key, entry] of entries) {
    for (const name of entry.names) if (!index.has(name)) index.set(name, key);
  }
  for (const [key] of entries) {
    const normalized = normalizeIngredientKey(key);
    if (!index.has(normalized)) index.set(normalized, key);
  }

  return {
    size: entries.length,
    urlFor(name) {
      const normalized = normalizeIngredientKey(name);
      if (!normalized) return null;
      for (const candidate of ingredientLookupKeys(name)) {
        const key = index.get(candidate);
        if (key) return urls.get(key) ?? null;
      }
      return null;
    },
  };
}

/** Reads and validates the manifest from disk; a missing/corrupt file means "no static images". */
export function loadIngredientImageManifest(
  dir: string = INGREDIENT_STATIC_DIR,
): IngredientImageManifest | null {
  const file = path.join(dir, 'manifest.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<IngredientImageManifest>;
    const entries: unknown = parsed.entries;
    if (parsed.version !== 1 || typeof entries !== 'object' || entries === null) {
      return null;
    }
    return parsed as IngredientImageManifest;
  } catch {
    return null;
  }
}
