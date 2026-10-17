import { describe, expect, it } from 'vitest';
import type { NutritionIngredient } from './compute';
import { computeRecipeNutrition } from './compute';
import { formNutritionLines, rowLineProblems } from './form-lines';

const rice: NutritionIngredient = {
  id: 'rice',
  kcalPer100g: 360,
  proteinPer100g: 7,
  carbsPer100g: 80,
  fatPer100g: 1,
  fiberPer100g: 1,
  densityGPerMl: null,
  edibleFraction: 1,
  portions: [],
};
const lookup = new Map([[rice.id, rice]]);

const row = (
  name: string,
  quantity: number | null,
  unit: string,
  ingredientId: string | null = 'rice',
) => ({
  name,
  quantity,
  unit,
  ingredientId,
});

function problemsOf(rows: ReturnType<typeof row>[]) {
  const { lines, rowOf } = formNutritionLines(rows);
  return rowLineProblems(rows.length, rowOf, computeRecipeNutrition(lines, lookup, 1));
}

describe('formNutritionLines + rowLineProblems (F2: which row needs data)', () => {
  it('skips nameless rows but keeps each problem on the row it came from', () => {
    expect(problemsOf([row('', null, ''), row('rice', 1, 'cup'), row('rice', 200, 'g')])).toEqual([
      undefined,
      'NO_DENSITY',
      undefined,
    ]);
  });

  it('a named row with no amount, or an amount of 0, is BAD_QTY — the save rule blocks both', () => {
    expect(problemsOf([row('rice', null, 'g'), row('rice', 0, 'g'), row('rice', -1, 'g')])).toEqual(
      ['BAD_QTY', 'BAD_QTY', 'BAD_QTY'],
    );
  });

  it('an unlinked named row is NO_INGREDIENT whatever its amount', () => {
    expect(problemsOf([row('grandma spice', null, 'g', null)])).toEqual(['NO_INGREDIENT']);
  });

  it('an optional row’s problem does not count', () => {
    const rows = [{ ...row('rice', 1, 'cup'), optional: true }];
    const { lines, rowOf } = formNutritionLines(rows);
    expect(rowLineProblems(1, rowOf, computeRecipeNutrition(lines, lookup, 1))).toEqual([
      undefined,
    ]);
  });

  it('no result yet means no problems', () => {
    expect(rowLineProblems(2, [0, 1], undefined)).toEqual([undefined, undefined]);
  });
});
