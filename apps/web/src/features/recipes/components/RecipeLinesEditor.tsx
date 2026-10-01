'use client';

import { useState, type ReactNode } from 'react';
import { IngredientFormModal } from '@/features/ingredients/components/IngredientFormModal';
import type { PickedIngredient } from '@/features/ingredients/lib/picked-ingredient';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { LineProblem } from '@chefer/types';
import { cn, pressControl } from '@chefer/ui';
import { ingredientUnitOptions, lineProblemCopy } from '@chefer/utils';
import {
  isBlankRow,
  isCompleteRow,
  lineRowName,
  lineRowQuantity,
  newLineRow,
  pickCandidate,
  pickIngredient,
  type LineRow,
} from '../lib/recipe-lines';
import { IngredientField, IngredientPickerSheet } from './IngredientPicker';

// ─── Recipe lines editor (plan-ingredient-catalog §10) ────────────────────────
// The ingredient list of every web recipe form (new, edit, video draft, import
// review). Each line is picked from the catalog; its unit list is limited to
// what converts for that ingredient (grams, its portions, volume only with a
// density). An unmatched line (legacy text, an import) shows the resolver's
// suggestions, a search and "Create as my ingredient". Line problems come from
// the live computation (`useLiveNutrition`).

export type LineField = 'ingredient' | 'qty' | 'unit';
export const lineFieldId = (prefix: string, index: number, field: LineField): string =>
  `${prefix}-line-${index}-${field}`;

/** The field a failed submit should focus for the first incomplete row. */
export function firstIncompleteField(rows: readonly LineRow[]): {
  index: number;
  field: LineField;
} {
  const index = Math.max(
    0,
    rows.findIndex((r) => !isBlankRow(r) && !isCompleteRow(r)),
  );
  const row = rows[index];
  const field: LineField =
    !row || !lineRowName(row) ? 'ingredient' : !((lineRowQuantity(row) ?? 0) > 0) ? 'qty' : 'unit';
  return { index, field };
}

export function RecipeLinesEditor({
  rows,
  onChange,
  problems,
  idPrefix,
  error,
  errorId,
  rowNote,
  onQuantityEdited,
  addLabel = 'Add ingredient',
}: {
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  /** Per row key, from the live computation. */
  problems: ReadonlyMap<string, LineProblem>;
  idPrefix: string;
  /** Section error (no complete line): incomplete rows are marked and point at it. */
  error?: string | undefined;
  errorId?: string | undefined;
  /** Extra per-row message (e.g. the video draft's "amount not heard"). */
  rowNote?: ((row: LineRow, index: number) => ReactNode) | undefined;
  onQuantityEdited?: ((row: LineRow) => void) | undefined;
  addLabel?: string;
}) {
  const [pickerFor, setPickerFor] = useState<{ key: string; query: string } | null>(null);
  const [createFor, setCreateFor] = useState<{ key: string; query: string } | null>(null);

  const update = (key: string, patch: (row: LineRow) => LineRow) =>
    onChange(rows.map((r) => (r.key === key ? patch(r) : r)));
  const remove = (key: string) => {
    const next = rows.filter((r) => r.key !== key);
    onChange(next.length > 0 ? next : [newLineRow()]);
  };

  const linkFromSearch = (key: string, ingredient: PickedIngredient) => {
    update(key, (r) => pickIngredient(r, ingredient));
  };

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((row, i) => {
          const name = lineRowName(row);
          const qty = lineRowQuantity(row);
          const incomplete = !!error && !isBlankRow(row) && !isCompleteRow(row);
          const describedBy = error ? errorId : undefined;
          const units = ingredientUnitOptions(row.ingredient);
          const unitOptions = row.unit && !units.includes(row.unit) ? [row.unit, ...units] : units;
          const problem = problems.get(row.key);
          const unmatched = !row.ingredient && row.rawName.trim() !== '';
          return (
            <li
              key={row.key}
              className="rounded-xl border p-2 sm:border-0 sm:p-0"
              data-testid="recipe-line"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:flex-1">
                  <IngredientField
                    id={lineFieldId(idPrefix, i, 'ingredient')}
                    label={`Ingredient ${i + 1}`}
                    ingredient={row.ingredient}
                    rawName={row.rawName}
                    invalid={incomplete && !name}
                    describedBy={describedBy}
                    onOpen={() => setPickerFor({ key: row.key, query: row.rawName })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={lineFieldId(idPrefix, i, 'qty')}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.quantity}
                    onChange={(e) => {
                      update(row.key, (r) => ({ ...r, quantity: e.target.value }));
                      onQuantityEdited?.(row);
                    }}
                    placeholder="Qty"
                    aria-label={`Amount for ingredient ${i + 1}`}
                    aria-invalid={
                      (incomplete && !((qty ?? 0) > 0)) || problem === 'BAD_QTY' || undefined
                    }
                    aria-describedby={describedBy}
                    className={cn(
                      'min-h-11 w-20 shrink-0 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-500 focus:outline-none',
                      incomplete && !((qty ?? 0) > 0)
                        ? 'border-red-400 focus:border-red-500'
                        : 'focus:border-[#944a00]',
                    )}
                  />
                  <select
                    id={lineFieldId(idPrefix, i, 'unit')}
                    value={row.unit}
                    onChange={(e) => update(row.key, (r) => ({ ...r, unit: e.target.value }))}
                    aria-label={`Unit for ingredient ${i + 1}`}
                    aria-invalid={
                      problem === 'NO_DENSITY' || problem === 'NO_PORTION' || problem === 'BAD_UNIT'
                        ? true
                        : undefined
                    }
                    className="min-h-11 w-28 min-w-0 shrink-0 rounded-xl border bg-white px-2 py-2 text-sm text-gray-800 focus:border-[#944a00] focus:outline-none"
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(row.key)}
                    aria-label={`Remove ingredient ${i + 1}`}
                    className={cn(
                      'ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-red-50 hover:text-red-600 sm:ml-0',
                      pressControl,
                    )}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {unmatched && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">
                  <p>
                    {row.candidates && row.candidates.length > 0 ? (
                      <>
                        Pick a match for <strong>“{row.rawName.trim()}”</strong>:
                      </>
                    ) : (
                      <>
                        No catalog match for <strong>“{row.rawName.trim()}”</strong> yet.
                      </>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(row.candidates ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => update(row.key, (r) => pickCandidate(r, c))}
                        className={cn(
                          'min-h-11 max-w-full truncate rounded-full border border-amber-300 bg-white px-3 text-xs font-medium text-gray-900 hover:border-[#944a00]',
                          pressControl,
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPickerFor({ key: row.key, query: row.rawName.trim() })}
                      className={cn(
                        'flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#944a00] hover:bg-white',
                        pressControl,
                      )}
                    >
                      <Search className="h-3 w-3" aria-hidden="true" />
                      Search the catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateFor({ key: row.key, query: row.rawName.trim() })}
                      className={cn(
                        'flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#944a00] hover:bg-white',
                        pressControl,
                      )}
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Create as my ingredient
                    </button>
                  </div>
                </div>
              )}

              {row.ingredient && problem && problem !== 'NO_INGREDIENT' && (
                <p className="mt-1 text-xs text-amber-900">{lineProblemCopy(problem)}</p>
              )}
              {row.note && <p className="mt-1 text-xs text-gray-500">Note: {row.note}</p>}
              {rowNote?.(row, i)}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...rows, newLineRow()])}
        className={cn(
          'mt-2 flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline',
          pressControl,
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addLabel}
      </button>

      <IngredientPickerSheet
        open={pickerFor !== null}
        initialQuery={pickerFor?.query ?? ''}
        onClose={() => setPickerFor(null)}
        onPick={(ingredient) => {
          if (pickerFor) linkFromSearch(pickerFor.key, ingredient);
          setPickerFor(null);
        }}
        onCreate={(query) => {
          if (pickerFor) setCreateFor({ key: pickerFor.key, query });
          setPickerFor(null);
        }}
      />

      {createFor && (
        <IngredientFormModal
          mode="create"
          initialName={createFor.query}
          onClose={() => setCreateFor(null)}
          onSaved={(ingredient) => {
            if (ingredient) linkFromSearch(createFor.key, ingredient);
            setCreateFor(null);
          }}
          onUseExisting={(ingredient) => {
            linkFromSearch(createFor.key, ingredient);
            setCreateFor(null);
          }}
        />
      )}
    </div>
  );
}
