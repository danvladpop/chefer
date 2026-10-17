import type { LineProblem } from '@chefer/types';
import {
  parseQuantityInput,
  type NutritionLineInput,
  type RecipeNutritionResult,
} from '@chefer/utils';

// F2 (owner feedback 2026-10-17): the import review said "Incomplete — 1
// ingredient needs data" without saying which. The live computation runs over
// the named rows only, so its line k is not form row k; `rowOf` keeps the way
// back, and every counted line's problem lands on the row it came from.

type DraftRow = { name: string; quantity: string; unit: string };

/** The review rows as live-nutrition lines, and the form row each line came from. */
export function draftNutritionLines(
  rows: readonly DraftRow[],
  ingredientIdAt: (row: number) => string | null,
): { lines: NutritionLineInput[]; rowOf: number[] } {
  const lines: NutritionLineInput[] = [];
  const rowOf: number[] = [];
  rows.forEach((row, i) => {
    if (!row.name.trim()) return;
    // A named row with no usable amount stays in, as NaN, so the engine
    // reports it (BAD_QTY) and the status counts it: saving is blocked anyway.
    const quantity = parseQuantityInput(row.quantity) ?? Number.NaN;
    lines.push({ ingredientId: ingredientIdAt(i), quantity, unit: row.unit });
    rowOf.push(i);
  });
  return { lines, rowOf };
}

/** Each form row's live problem: undefined when it computes, is blank or optional. */
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
