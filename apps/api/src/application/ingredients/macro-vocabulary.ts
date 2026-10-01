import { prisma } from '@chefer/database';
import { normalizeIngredientName, visibleToUser } from '../../lib/ingredient-prices/index.js';
import type { MacroVocabularyRow } from '../../lib/recipe-import/macro-check.js';

/**
 * The macro vocabulary rows `userId` may read for these ingredient names, in
 * one query. Shared by plan reconcile and the import cross-check; only global
 * rows and the user's own private rows are visible (F6).
 */
export async function loadMacroVocabulary(
  names: string[],
  userId: string | null | undefined,
): Promise<MacroVocabularyRow[]> {
  const normalized = [...new Set(names.map(normalizeIngredientName))];
  if (normalized.length === 0) return [];
  return prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: normalized }, ...visibleToUser(userId) },
    select: {
      ingredientName: true,
      caloriesPer100g: true,
      proteinPer100g: true,
      carbsPer100g: true,
      fatPer100g: true,
      fiberPer100g: true,
      gramsPerPiece: true,
    },
  });
}
