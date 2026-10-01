/**
 * catalog-draft.json: the hand-curated half of the catalog. It holds naming
 * plus ONE source pointer per row, and no nutrient numbers. (The only
 * exception is `label` rows, which carry the values of a cited EU nutrition
 * label and are flagged for owner review.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENTS_DIR } from './sources';

export type DraftAlias = { alias: string; locale: 'en' | 'ro' };

export type LabelValues = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
  satFat?: number;
  sodiumMg?: number;
};

export type DraftSource =
  | { db: 'fdc'; id: number }
  | { db: 'ciqual'; id: number }
  | { db: 'label'; ref: string; values: LabelValues; retrieved: string };

export type DraftEntry = {
  slug: string;
  name: string;
  category: string;
  aliases: DraftAlias[];
  source: DraftSource;
  /** Extra FDC foods whose portion records may supply count portions. */
  portionsFrom?: number[];
  /** The FDC food whose volume measure gives the density (else own food, then portionsFrom). */
  densityFrom?: number;
  /** Pin an FDC portion record (by food_portion.id) to a unit, as ONE unit. */
  portionAs?: Record<string, string>;
  /** Canonical units to drop from the automatic mapping. */
  skipPortions?: string[];
  /** Free-text provenance remark appended to sourceNote (e.g. "closest CIQUAL match"). */
  note?: string;
  /** Set when the owner should look at this row (proxy match, label row…). */
  review?: string;
};

export const DRAFT_PATH = join(INGREDIENTS_DIR, 'catalog-draft.json');

export function loadDraft(path = DRAFT_PATH): DraftEntry[] {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('catalog-draft.json must be an array');
  const problems: string[] = [];
  raw.forEach((r: DraftEntry, i) => {
    const at = `#${i} ${r?.slug ?? '?'}`;
    if (typeof r.slug !== 'string' || typeof r.name !== 'string' || typeof r.category !== 'string')
      problems.push(`${at}: slug/name/category required`);
    if (!Array.isArray(r.aliases)) problems.push(`${at}: aliases must be an array`);
    const s = r.source as DraftSource | undefined;
    if (!s || !['fdc', 'ciqual', 'label'].includes(s.db))
      problems.push(`${at}: source.db must be fdc|ciqual|label`);
    else if (s.db === 'label') {
      if (!s.ref || !s.values || !s.retrieved)
        problems.push(`${at}: label source needs ref, retrieved and values`);
      if (!r.review) problems.push(`${at}: label rows must carry a review flag`);
    } else if (!Number.isInteger(s.id)) problems.push(`${at}: source.id must be an integer`);
    const allowed = new Set([
      'slug',
      'name',
      'category',
      'aliases',
      'source',
      'portionsFrom',
      'densityFrom',
      'portionAs',
      'skipPortions',
      'note',
      'review',
    ]);
    for (const k of Object.keys(r))
      if (!allowed.has(k))
        problems.push(`${at}: unknown key "${k}" (numbers never belong in the draft)`);
  });
  if (problems.length)
    throw new Error(`catalog-draft.json is malformed:\n  ${problems.join('\n  ')}`);
  return raw as DraftEntry[];
}
