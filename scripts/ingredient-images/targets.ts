/**
 * Builds the list of ingredients that need a vendored thumbnail
 * (scripts/ingredient-images/vendor.ts).
 *
 * Images are keyed like the shopping list groups lines (apps/api/src/application/
 * shopping-list/aggregate.ts `lineIdentity`): the catalog slug as a space
 * separated key when a recipe line is catalog-linked, else `ingredientBaseKey`
 * of the name. The display names seen for a key are kept so the API resolver
 * (which only receives a display name) can find the image.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ingredientBaseKey,
  ingredientLookupKeys,
  ingredientSlug,
  normalizeIngredientKey,
  slugToKey,
} from '@chefer/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = join(
  __dirname,
  '..',
  '..',
  'packages',
  'database',
  'data',
  'ingredients',
  'catalog.json',
);

type CatalogRow = { slug: string; name: string; aliases?: { alias: string }[] };

export type Target = {
  /** Canonical key (shopping-list identity). */
  key: string;
  /** File stem inside static/ingredients. */
  file: string;
  /** Display names that resolve to this image (normalized lookup form). */
  names: string[];
  /** Human wording the prompt is built from. */
  subject: string;
  /** Where the key came from. */
  origin: 'recipe' | 'catalog';
};

export type RecipeLine = { name: string; slug?: string | undefined };

/** The (full, singular) normalized forms of a display name. */
function nameForms(raw: string): string[] {
  return ingredientLookupKeys(raw).slice(0, 2);
}

function loadCatalog(): CatalogRow[] {
  return JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as CatalogRow[];
}

/** Friendly subject for a catalog row: first alias, else the name before the first comma. */
function catalogSubject(row: CatalogRow): string {
  const alias = row.aliases?.[0]?.alias;
  return (alias ?? row.name.split(',')[0] ?? row.name).trim();
}

/** "Chicken breast (boneless), diced" → "chicken breast". */
function cleanSubject(name: string): string {
  const noParen = name.replace(/\([^)]*\)/g, ' ');
  return (noParen.split(',')[0] ?? noParen).replace(/\s+/g, ' ').trim().toLowerCase();
}

function pushUnique(list: string[], values: string[]): void {
  for (const v of values) if (v && !list.includes(v)) list.push(v);
}

/**
 * `skip` drops lines nobody shops for (water, salt…): the shopping list never shows them.
 *
 * Recipe lines are keyed by `ingredientBaseKey` of their display name, NOT by
 * catalog slug: the API resolver is only handed the display name the shopping
 * list shows (the shortest wording of a merged group — "Halloumi", not the
 * slug's generic "cheese average"), so a picture per wording is what actually
 * matches what the user sees. Catalog rows (scope `all`) are keyed by slug and
 * added only when no recipe wording already covers them.
 */
export function buildTargets(opts: {
  scope: 'used' | 'all';
  recipeLines: RecipeLine[];
  skip: (name: string) => boolean;
}): Target[] {
  const targets = new Map<string, Target>();

  for (const line of opts.recipeLines) {
    if (opts.skip(line.name)) continue;
    const key = ingredientBaseKey(line.name);
    if (!key) continue;
    const subject = cleanSubject(line.name) || key;
    const existing = targets.get(key);
    if (!existing) {
      targets.set(key, {
        key,
        file: ingredientSlug(key),
        names: [...new Set(nameForms(line.name))],
        subject,
        origin: 'recipe',
      });
      continue;
    }
    pushUnique(existing.names, nameForms(line.name));
    if (subject.length < existing.subject.length) existing.subject = subject;
  }

  if (opts.scope === 'all') {
    const covered = new Set<string>();
    for (const t of targets.values()) for (const n of [t.key, ...t.names]) covered.add(n);
    for (const row of loadCatalog()) {
      const names = [row.name, ...(row.aliases ?? []).map((a) => a.alias)].flatMap(nameForms);
      const key = slugToKey(row.slug);
      if (targets.has(key) || names.some((n) => covered.has(n))) continue;
      targets.set(key, {
        key,
        file: row.slug,
        names: [...new Set(names)],
        subject: catalogSubject(row),
        origin: 'catalog',
      });
    }
  }

  for (const t of targets.values()) pushUnique(t.names, [normalizeIngredientKey(t.key)]);
  return [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
}
