import type { LineProblem } from '@chefer/types';
import type { NutritionLineInput, RecipeNutritionResult } from './compute';

// F2 (owner feedback 2026-10-17): a recipe form's live status said "Incomplete
// — 1 ingredient needs data" without saying which. Web and mobile build the
// live computation from their rows the same way: rows with no name are
// skipped (so live line k is not form row k — `rowOf` is the way back), and a
// named row with no amount > 0 stays in as BAD_QTY, because the save rule
// (`videoDraftProblems`) rejects it too.

/** One editable ingredient row, as the form holds it. */
export interface FormLineRow {
  name: string;
  /** The parsed amount; null when nothing usable was typed. */
  quantity: number | null;
  unit: string;
  ingredientId: string | null;
  optional?: boolean | undefined;
}

/** The form's rows as live-nutrition lines, and the form row each line came from. */
export function formNutritionLines(rows: readonly FormLineRow[]): {
  lines: NutritionLineInput[];
  rowOf: number[];
} {
  const lines: NutritionLineInput[] = [];
  const rowOf: number[] = [];
  rows.forEach((row, i) => {
    if (!row.name.trim()) return;
    const quantity = row.quantity !== null && row.quantity > 0 ? row.quantity : Number.NaN;
    lines.push({
      ingredientId: row.ingredientId,
      quantity,
      unit: row.unit,
      ...(row.optional ? { optional: true } : {}),
    });
    rowOf.push(i);
  });
  return { lines, rowOf };
}

/** Each form row's counted problem: undefined when it computes, is nameless or optional. */
export function rowLineProblems(
  rowCount: number,
  rowOf: readonly number[],
  result: Pick<RecipeNutritionResult, 'lines'> | undefined,
): (LineProblem | undefined)[] {
  const problems: (LineProblem | undefined)[] = Array.from({ length: rowCount }, () => undefined);
  result?.lines.forEach((line, k) => {
    const row = rowOf[k];
    if (row !== undefined && !line.optional && line.problem) problems[row] = line.problem;
  });
  return problems;
}
