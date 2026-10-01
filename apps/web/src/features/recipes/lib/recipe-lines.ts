import { pickedFromRef, type PickedIngredient } from '@/features/ingredients/lib/picked-ingredient';
import type { RouterOutputs } from '@/lib/trpc';
import { normalizeRecipeUnit, parseQuantityInput, unitForPickedIngredient } from '@chefer/utils';

// ─── Recipe line rows (plan-ingredient-catalog §10) ───────────────────────────
// One model for every web recipe-line editor: new, edit, import review and the
// video draft. A row is linked to a catalog ingredient (`ingredient`), or it
// carries the text someone wrote (`rawName`: a legacy line, an import) plus
// the resolver's suggestions until the user picks one.

export interface LineRow {
  /** Stable React key (rows are added, removed and reordered by index). */
  key: string;
  ingredient: PickedIngredient | null;
  /**
   * What the author, importer or AI wrote. Kept as the line's name when a
   * suggestion is picked for it; cleared when the user picks another
   * ingredient through search, so the name follows the pick.
   */
  rawName: string;
  /** As typed: "200", "1/2", "1 1/2". */
  quantity: string;
  unit: string;
  note?: string | null | undefined;
  optional?: boolean | undefined;
  /** Resolver suggestions for an unlinked row; never applied without the user (§6.1). */
  candidates?: PickedIngredient[] | undefined;
}

/** The line shape recipe.create/update and importSave take. */
export interface SaveLine {
  name: string;
  quantity: number;
  unit: string;
  ingredientId?: string;
  note?: string;
  optional?: boolean;
}

let seq = 0;
export const nextLineKey = (): string => `line-${Date.now().toString(36)}-${++seq}`;

export function newLineRow(overrides: Partial<LineRow> = {}): LineRow {
  return {
    key: nextLineKey(),
    ingredient: null,
    rawName: '',
    quantity: '',
    unit: 'g',
    ...overrides,
  };
}

/** The name a row shows and saves: the raw text when there is one, else the catalog name. */
export function lineRowName(row: LineRow): string {
  const raw = row.rawName.trim();
  return raw !== '' ? raw : (row.ingredient?.name ?? '');
}

export const lineRowQuantity = (row: LineRow): number | null => parseQuantityInput(row.quantity);

/** Nothing typed or picked: skipped on save instead of reported. */
export function isBlankRow(row: LineRow): boolean {
  return !row.ingredient && !row.rawName.trim() && !row.quantity.trim();
}

/** A name, an amount > 0 and a unit. */
export function isCompleteRow(row: LineRow): boolean {
  return Boolean(lineRowName(row) && (lineRowQuantity(row) ?? 0) > 0 && row.unit.trim());
}

/** Links a row to an ingredient picked through search: the name follows the pick. */
export function pickIngredient(row: LineRow, ingredient: PickedIngredient): LineRow {
  return {
    ...row,
    ingredient,
    rawName: '',
    candidates: undefined,
    unit: unitForPickedIngredient(row.unit, ingredient),
  };
}

/** Links a row to one of the resolver's suggestions for its text: the text stays the name. */
export function pickCandidate(row: LineRow, ingredient: PickedIngredient): LineRow {
  return {
    ...row,
    ingredient,
    candidates: undefined,
    unit: unitForPickedIngredient(row.unit, ingredient),
  };
}

export function toSaveLine(row: LineRow): SaveLine {
  return {
    name: lineRowName(row),
    quantity: lineRowQuantity(row) ?? 0,
    unit: row.unit.trim(),
    ...(row.ingredient ? { ingredientId: row.ingredient.id } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.optional ? { optional: true } : {}),
  };
}

/** The complete rows, ready for recipe.create/update or importSave. */
export function toSaveLines(rows: readonly LineRow[]): SaveLine[] {
  return rows.filter(isCompleteRow).map(toSaveLine);
}

type ImportResolution = RouterOutputs['recipe']['importVideoPreview']['resolution'][number];

/**
 * Rows for an imported recipe's lines (Cheferize or video draft), with the
 * server's catalog resolution by position: an EXACT/ALIAS match comes back
 * linked, anything else carries its suggestions. Units are canonical with the
 * prep text in `note` ("cloves, minced" → clove + minced).
 */
export function rowsFromImport(
  ingredients: readonly { name: string; quantity: number; unit: string }[],
  resolution: readonly (ImportResolution | undefined)[],
): LineRow[] {
  return ingredients.map((ing, i) => {
    const r = resolution[i];
    const normalized = normalizeRecipeUnit(ing.unit);
    return newLineRow({
      rawName: ing.name,
      quantity: ing.quantity > 0 ? String(ing.quantity) : '',
      unit: [r?.unit, normalized.unit, ing.unit].find((u) => u !== undefined && u !== '') ?? 'g',
      note: r?.note ?? normalized.note ?? null,
      ingredient: r?.match ? pickedFromRef(r.match) : null,
      candidates: r?.match ? undefined : (r?.candidates ?? []).map(pickedFromRef),
    });
  });
}
