import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNT_PORTION_UNITS, type CatalogEntry, type CatalogPortion } from './validate';

/**
 * Curated portions overlay (UX-REC-14): `data/ingredients/portions-overlay.json`.
 *
 * `catalog.json` is generated, so a recipe unit the dataset happens not to name
 * (a "piece" of garlic, when FDC only publishes "clove") would stay PARTIAL
 * forever. The overlay adds such portions without touching generated data. Every
 * row names its source; the rules are in data/ingredients/SOURCES.md ("Portions
 * overlay"). `readCatalogFile` merges it in, so the deploy-time
 * `ingredients:sync`, the curated recipe pool and the repair guard all see it.
 */

export const PORTIONS_OVERLAY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/ingredients/portions-overlay.json',
);

export type PortionsOverlayRow = {
  slug: string;
  /** Canonical count portion unit (one of COUNT_PORTION_UNITS). */
  unit: string;
  /** Edible grams for ONE unit. */
  grams: number;
  /** `fdc-portion:<id>`, `ciqual:<alim_code>` or `ref:<named published reference>`. */
  source: string;
  /**
   * When the row re-labels a portion the catalog already has (FDC "1 clove" used
   * as "piece"), that portion's unit. The validator then checks that grams and
   * source are identical to it, so the number is never re-typed.
   */
  basedOn?: string;
  /** Why this source measure stands for this unit; one sentence. */
  note: string;
};

const SOURCE_RE = /^(fdc-portion:\d+|ciqual:\d+|ref:\S.*)$/;
const MAX_PORTION_GRAMS = 2000;

export function readPortionsOverlay(path: string = PORTIONS_OVERLAY_PATH): PortionsOverlayRow[] {
  return JSON.parse(readFileSync(path, 'utf8')) as PortionsOverlayRow[];
}

/**
 * Overlay rows that cannot be applied: unknown slug, a unit the row already has
 * (generated data always wins), malformed fields, a missing or unusable source.
 * Strict, for CI (portions-overlay.test.ts) and the catalog build.
 */
export function validatePortionsOverlay(
  overlay: readonly PortionsOverlayRow[],
  entries: readonly CatalogEntry[],
): string[] {
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const row of overlay) {
    const id = `${row.slug}/${row.unit}`;
    const entry = bySlug.get(row.slug);
    if (!entry) {
      problems.push(`${id}: slug is not in the catalog`);
      continue;
    }
    if (seen.has(id)) problems.push(`${id}: listed twice`);
    seen.add(id);
    if (!(COUNT_PORTION_UNITS as readonly string[]).includes(row.unit))
      problems.push(`${id}: unit is not a canonical count portion unit`);
    if (!Number.isFinite(row.grams) || row.grams <= 0 || row.grams >= MAX_PORTION_GRAMS)
      problems.push(`${id}: grams ${row.grams} outside (0, ${MAX_PORTION_GRAMS})`);
    if (typeof row.source !== 'string' || !SOURCE_RE.test(row.source))
      problems.push(
        `${id}: source "${row.source}" must be fdc-portion:<id>, ciqual:<code> or ref:<text>`,
      );
    if (typeof row.note !== 'string' || row.note.trim() === '')
      problems.push(`${id}: note is required`);
    if (entry.portions.some((p) => p.unit === row.unit))
      problems.push(`${id}: the generated catalog already has this unit (generated data wins)`);
    if (row.basedOn !== undefined) {
      const base = entry.portions.find((p) => p.unit === row.basedOn);
      if (!base) problems.push(`${id}: basedOn "${row.basedOn}" is not a portion of ${row.slug}`);
      else if (base.grams !== row.grams || base.source !== row.source)
        problems.push(
          `${id}: must equal its basedOn portion ${row.basedOn} (${base.grams} g, ${base.source})`,
        );
    }
  }
  return problems;
}

/**
 * Entries with the overlay's portions appended. Lenient so a bad row can never
 * take the API down: a row for an unknown slug, or for a unit the generated row
 * already has, is skipped (CI reports it through {@link validatePortionsOverlay}).
 * Entries are copied, never mutated.
 */
export function applyPortionsOverlay(
  entries: readonly CatalogEntry[],
  overlay: readonly PortionsOverlayRow[],
): CatalogEntry[] {
  const extra = new Map<string, CatalogPortion[]>();
  for (const row of overlay) {
    const list = extra.get(row.slug) ?? [];
    list.push({ unit: row.unit, grams: row.grams, source: row.source });
    extra.set(row.slug, list);
  }
  return entries.map((e) => {
    const add = extra.get(e.slug)?.filter((p) => !e.portions.some((q) => q.unit === p.unit));
    return add && add.length > 0 ? { ...e, portions: [...e.portions, ...add] } : e;
  });
}
