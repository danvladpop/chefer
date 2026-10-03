import { formatScaledQuantity } from './scaled-quantity';
import type { UnitSystem } from './units';

// UX-REC-04: the plain-text body of "Share recipe" — one function for the
// native Share sheet (mobile) and navigator.share / clipboard (web).

export interface ActionRecipe {
  name: string;
  description?: string | undefined;
  servings: number;
  sourceUrl?: string | undefined;
  ingredients: readonly { name: string; quantity: number; unit: string }[];
  instructions: readonly string[];
}

/** The text the native Share sheet receives: name, ingredients, steps, source. */
export function recipeShareText(recipe: ActionRecipe, unitSystem: UnitSystem): string {
  const lines: string[] = [recipe.name];
  const description = recipe.description?.trim();
  if (description) lines.push('', description);
  lines.push('', `Ingredients (${recipe.servings} serving${recipe.servings === 1 ? '' : 's'})`);
  for (const ing of recipe.ingredients) {
    lines.push(`- ${formatScaledQuantity(ing.quantity, ing.unit, 1, unitSystem)} ${ing.name}`);
  }
  if (recipe.instructions.length > 0) {
    lines.push('', 'Steps');
    recipe.instructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  if (recipe.sourceUrl) lines.push('', `Source: ${recipe.sourceUrl}`);
  lines.push('', 'Shared from Chefer');
  return lines.join('\n');
}
