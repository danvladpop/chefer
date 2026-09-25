import { describe, expect, it } from 'vitest';
import type { RecipeData, WeekPlanResponse } from '../../lib/ai/index.js';
import { withServerRecipeIds } from './recipe-ids.js';

const recipe = (id: string): RecipeData => ({ id, name: `name-${id}` }) as unknown as RecipeData;

const plan: WeekPlanResponse = {
  days: [
    {
      dayOfWeek: 0,
      meals: [
        { type: 'BREAKFAST', recipe: recipe('omelette') },
        { type: 'DINNER', recipe: recipe('baked-cod') },
      ],
    },
    {
      dayOfWeek: 1,
      meals: [{ type: 'LUNCH', recipe: recipe('baked-cod'), leftoverOf: 'Monday' }],
    },
  ],
} as unknown as WeekPlanResponse;

describe('withServerRecipeIds', () => {
  it('replaces every LLM slug with a fresh id', () => {
    let n = 0;
    const out = withServerRecipeIds(plan, () => `srv-${++n}`);
    const ids = out.days.flatMap((d) => d.meals.map((m) => m.recipe.id));
    expect(ids).toEqual(['srv-1', 'srv-2', 'srv-2']);
  });

  it('keeps slots that shared a recipe pointing at the same new id', () => {
    const out = withServerRecipeIds(plan);
    expect(out.days[0]!.meals[1]!.recipe.id).toBe(out.days[1]!.meals[0]!.recipe.id);
    expect(out.days[0]!.meals[0]!.recipe.id).not.toBe(out.days[0]!.meals[1]!.recipe.id);
  });

  it('leaves the input plan and non-id fields untouched', () => {
    const out = withServerRecipeIds(plan);
    expect(plan.days[0]!.meals[0]!.recipe.id).toBe('omelette');
    expect(out.days[1]!.meals[0]!.leftoverOf).toBe('Monday');
    expect(out.days[0]!.meals[0]!.recipe.name).toBe('name-omelette');
  });
});
