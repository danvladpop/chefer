import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_FILE_PATH, type CatalogIngredientRow } from '@chefer/database';
import { ingredientLookupKeys } from '@chefer/utils';

// ─── Legacy line policy (plan-ingredient-catalog §7, migration only) ─────────
// Pure helpers behind `ingredients:migrate`: the committed name mapping
// (data/ingredients/legacy-mapping.json) and the legacy UNIT policy. Live saves
// never use either — a live line that doesn't resolve stays unresolved.

export type MappingEntry =
  | { slug: string; proxy?: boolean; note?: string; quantityFactor?: number }
  | { split: { slug: string; name: string; share: number }[] }
  | { partial: true; reason: string };

const MAPPING_PATH = join(CATALOG_FILE_PATH, '../legacy-mapping.json');
let mapping: Record<string, MappingEntry> | null = null;

function loadMapping(): Record<string, MappingEntry> {
  mapping ??= (
    JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) as { names: Record<string, MappingEntry> }
  ).names;
  return mapping;
}

const PREP_UNITS = new Set(['halved', 'pitted', 'sliced', 'diced', 'chopped', 'minced', 'whole']);
const SIZE_UNITS = new Set(['small', 'medium', 'large', 'extra-large']);

/** Candidate substitute units for a legacy unit that does not convert (see the policy above). */
export function unitSubstitutes(
  rawUnit: string,
  canonical: string,
  row: CatalogIngredientRow,
): { unit: string; factor: number; policy: string }[] {
  const has = (u: string) => row.portions.some((p) => p.unit === u);
  const out: { unit: string; factor: number; policy: string }[] = [];
  const size = /\(\s*(\d+(?:\.\d+)?)\s*(oz|g|ml)\s*\)/i.exec(rawUnit);
  if (size?.[1] && size[2])
    out.push({
      unit: size[2].toLowerCase(),
      factor: Number(size[1]),
      policy: `size in unit text (${size[1]} ${size[2]})`,
    });
  const lower = rawUnit.toLowerCase().trim();
  const countLike = canonical === 'piece' || PREP_UNITS.has(lower) || lower === '';
  if (countLike) {
    if (has('piece')) out.push({ unit: 'piece', factor: 1, policy: `count "${rawUnit}" → piece` });
    if (has('medium'))
      out.push({ unit: 'medium', factor: 1, policy: `count "${rawUnit}" → medium` });
    if (has('clove')) out.push({ unit: 'clove', factor: 1, policy: `count "${rawUnit}" → clove` });
    if (has('large'))
      out.push({ unit: 'large', factor: 1, policy: `count "${rawUnit}" → large (whole unit)` });
  }
  if (countLike && has('leaf') && !has('piece') && !has('medium'))
    out.push({ unit: 'leaf', factor: 1, policy: `count "${rawUnit}" → leaf` });
  // Zest measured in fruit ("1 lemon" of lemon zest): 1 tbsp per fruit, the
  // same equivalence the curated fixtures use (about 3 kcal; recorded).
  if (/^(lemons?|limes?|oranges?)$/.test(lower) && row.slug.endsWith('-zest'))
    out.push({ unit: 'tbsp', factor: 1, policy: `zest of "${rawUnit}" → 1 tbsp per fruit` });
  if (SIZE_UNITS.has(canonical)) {
    if (has('piece')) out.push({ unit: 'piece', factor: 1, policy: `size "${canonical}" → piece` });
    if (has('stalk')) out.push({ unit: 'stalk', factor: 1, policy: `size "${canonical}" → stalk` });
    if (has('leaf')) out.push({ unit: 'leaf', factor: 1, policy: `size "${canonical}" → leaf` });
  }
  if (/^stalks?$/.test(lower) && has('medium'))
    out.push({ unit: 'medium', factor: 1, policy: 'stalk → medium' });
  if (lower === 'strips' && has('slice'))
    out.push({ unit: 'slice', factor: 1, policy: 'strips → slice' });
  if (/^slices?$/.test(lower) && has('piece'))
    out.push({ unit: 'piece', factor: 1, policy: 'slice → piece' });
  if (/leaves|^pieces?$|^pcs$/.test(lower) && has('leaf'))
    out.push({ unit: 'leaf', factor: 1, policy: `"${rawUnit}" → leaf` });
  return out;
}

export function mappingFor(name: string): MappingEntry | undefined {
  const mapping = loadMapping();
  for (const key of ingredientLookupKeys(name)) {
    const m = mapping[key];
    if (m) return m;
  }
  return undefined;
}

/**
 * "1 can black beans" resolves to the COOKED row, which has no can portion.
 * The canned sibling (`black-beans-canned`, `chickpeas-canned-drained`) is
 * both the truer food and carries the owner's can size (2026-10-02), so a
 * "can" line moves there. Null when the row already weighs a can or has no
 * canned sibling with a can portion.
 */
export function cannedSibling(
  row: CatalogIngredientRow,
  canonicalUnit: string,
  bySlug: ReadonlyMap<string, CatalogIngredientRow>,
): CatalogIngredientRow | null {
  if (canonicalUnit !== 'can' || row.portions.some((p) => p.unit === 'can')) return null;
  const stem = row.slug.replace(/-(cooked|boiled|raw|dry|dried)$/, '');
  for (const slug of [`${stem}-canned`, `${stem}-canned-drained`]) {
    const sib = bySlug.get(slug);
    if (sib?.portions.some((p) => p.unit === 'can')) return sib;
  }
  return null;
}
