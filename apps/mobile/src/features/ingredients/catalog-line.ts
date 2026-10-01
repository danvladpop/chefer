import type { IngredientCategory, RecipeFormIngredientLine } from '@chefer/types';
import { isUnitUsableForIngredient, parseQuantity } from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';

// ─── Catalog-linked recipe lines (plan-ingredient-catalog §10, mobile) ────────
// The recipe form's line model once every line is picked from the ingredient
// catalog: the shared `RecipeFormIngredientLine` (strings, as typed) plus the
// catalog row it is linked to. Pure, so the form logic is unit-testable
// without rendering.

export type CatalogRef = RouterOutputs['ingredients']['resolve'][number]['candidates'][number];
export type IngredientSearchRow = RouterOutputs['ingredients']['search'][number];
export type ResolvedLine = RouterOutputs['ingredients']['resolve'][number];

/** What the form keeps about a picked catalog row: enough for the unit picker. */
export interface PickedIngredient {
  id: string;
  /** Display name ("Egg, whole, raw"). */
  name: string;
  category?: IngredientCategory | undefined;
  owner?: 'global' | 'mine' | undefined;
  portions: { unit: string; grams: number }[];
  hasDensity: boolean;
}

export interface CatalogFormLine extends RecipeFormIngredientLine {
  /** Stable React key: rows are removed, undone and re-inserted. */
  key: string;
  /** The catalog row this line is linked to. Every saved line needs one. */
  ingredientId?: string | undefined;
  /** Snapshot of the row from search/resolve; getMany details win when loaded. */
  ingredient?: PickedIngredient | undefined;
  /** What the author (or an older client) typed, kept for "Pick a match" and the mirror. */
  rawName?: string | undefined;
  /** Prep text the server split off ("minced"), sent back unchanged. */
  note?: string | null | undefined;
  /** Garnish line excluded from totals, sent back unchanged. */
  optional?: boolean | undefined;
  /** An unlinked legacy line: the resolver's suggestions (never auto-applied). */
  candidates?: CatalogRef[] | undefined;
  /** The line still waits for `ingredients.resolve` (legacy edit). */
  resolving?: boolean | undefined;
}

let keySeq = 0;
export function newLineKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

export function blankLine(): CatalogFormLine {
  return { key: newLineKey(), name: '', quantity: '', unit: 'g' };
}

/** A search row → the picked ingredient, or null for a legacy row without a catalog twin. */
export function pickedFromSearchRow(row: IngredientSearchRow): PickedIngredient | null {
  if (!row.id) return null;
  return {
    id: row.id,
    name: row.displayName,
    category: row.category,
    owner: row.owner,
    portions: row.portions ?? [],
    hasDensity: row.hasDensity ?? false,
  };
}

/** A resolve/import candidate (CatalogRef) → the picked ingredient. */
export function pickedFromRef(ref: CatalogRef): PickedIngredient {
  return {
    id: ref.id,
    name: ref.name,
    category: ref.category,
    owner: ref.owner,
    portions: ref.portions,
    hasDensity: ref.hasDensity,
  };
}

export type LineState = 'empty' | 'ok' | 'needsQuantity' | 'needsMatch' | 'needsUnit';

/**
 * What a line still needs before the recipe can save:
 * - `empty`: nothing typed, ignored;
 * - `needsMatch`: not linked to a catalog row (legacy text, or still resolving);
 * - `needsUnit`: linked, but the row cannot measure this unit (I6: no default weights);
 * - `needsQuantity`: linked, no amount (D-19's incomplete line).
 * `ingredient` is the row's best-known data (getMany detail or the picked snapshot);
 * without it the unit is trusted and the server decides.
 */
export function lineState(
  line: CatalogFormLine,
  ingredient: Pick<PickedIngredient, 'portions' | 'hasDensity'> | undefined,
): LineState {
  const named = line.name.trim() !== '' || (line.rawName ?? '').trim() !== '';
  const qty = parseQuantity(line.quantity);
  if (!named && !line.ingredientId && qty <= 0) return 'empty';
  if (!line.ingredientId) return 'needsMatch';
  if (ingredient && line.unit.trim() && !isUnitUsableForIngredient(line.unit, ingredient)) {
    return 'needsUnit';
  }
  if (qty <= 0) return 'needsQuantity';
  return 'ok';
}

/** The save payload's lines: every `ok` line, linked, with its note/optional round-tripped. */
export function linesToPayload(lines: readonly CatalogFormLine[]): {
  name: string;
  quantity: number;
  unit: string;
  ingredientId?: string;
  note?: string;
  optional?: boolean;
}[] {
  return lines
    .filter((l) => l.ingredientId && parseQuantity(l.quantity) > 0 && l.unit.trim())
    .map((l) => ({
      name: ([l.name.trim(), l.rawName?.trim(), l.ingredient?.name].find(Boolean) ?? '').slice(
        0,
        200,
      ),
      quantity: parseQuantity(l.quantity),
      unit: l.unit.trim(),
      ...(l.ingredientId ? { ingredientId: l.ingredientId } : {}),
      ...(l.note ? { note: l.note.slice(0, 200) } : {}),
      ...(l.optional ? { optional: true } : {}),
    }));
}

/** The engine's view of the form, for the live preview. */
export function linesForPreview(lines: readonly CatalogFormLine[]): {
  ingredientId: string | null;
  quantity: number;
  unit: string;
  optional?: boolean;
}[] {
  return lines
    .filter((l) => lineState(l, undefined) !== 'empty' && parseQuantity(l.quantity) > 0)
    .map((l) => ({
      ingredientId: l.ingredientId ?? null,
      quantity: parseQuantity(l.quantity),
      unit: l.unit,
      ...(l.optional ? { optional: true } : {}),
    }));
}

type StoredLine = RouterOutputs['recipe']['getMyRecipe']['lines'][number];
interface MirrorLine {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Edit prefill. A recipe with stored catalog lines comes back linked (the
 * typed name and unit from the Json mirror, the link from the line). Lines
 * without an id, or a recipe from before the catalog (no stored lines), come
 * back `resolving` — the form asks `ingredients.resolve` for them.
 */
export function prefillLines(
  mirror: readonly MirrorLine[],
  stored: readonly StoredLine[] | undefined,
): CatalogFormLine[] {
  if (mirror.length === 0) return [blankLine()];
  const byPosition =
    stored?.length === mirror.length ? [...stored].sort((a, b) => a.position - b.position) : null;
  return mirror.map((m, i) => {
    const s = byPosition?.[i];
    const line: CatalogFormLine = {
      key: newLineKey(),
      name: m.name,
      rawName: s?.rawName ?? m.name,
      quantity: String(m.quantity),
      unit: m.unit,
    };
    if (s?.note) line.note = s.note;
    if (s?.optional) line.optional = true;
    if (s?.ingredientId) {
      line.ingredientId = s.ingredientId;
      line.linked = true;
      // The stored unit is canonical ("clove" for a typed "cloves, minced"),
      // which is what the unit picker offers.
      line.unit = s.unit || m.unit;
    } else {
      line.resolving = true;
    }
    return line;
  });
}

/**
 * Applies `ingredients.resolve` results to the lines that were waiting:
 * EXACT/ALIAS links (the same rule the server applies on save), anything
 * else keeps the text and shows its candidates for a human pick.
 */
export function applyResolution(
  lines: readonly CatalogFormLine[],
  results: readonly ResolvedLine[],
): CatalogFormLine[] {
  let k = 0;
  return lines.map((line) => {
    if (!line.resolving) return line;
    const r = results[k];
    k += 1;
    if (!r) return { ...line, resolving: false };
    if (r.match && (r.confidence === 'EXACT' || r.confidence === 'ALIAS')) {
      const ingredient = pickedFromRef(r.match);
      return {
        ...line,
        resolving: false,
        ingredientId: ingredient.id,
        ingredient,
        linked: true,
        unit: r.unit && isUnitUsableForIngredient(r.unit, ingredient) ? r.unit : line.unit,
        ...(r.note && !line.note ? { note: r.note } : {}),
      };
    }
    return { ...line, resolving: false, candidates: r.candidates };
  });
}
