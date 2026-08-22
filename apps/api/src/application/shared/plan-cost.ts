import { prisma } from '@chefer/database';
import type { Ingredient } from '../../lib/ai/types.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
} from '../../lib/ingredient-prices/index.js';

// ─── Weekly plan cost estimation (P2-4) ───────────────────────────────────────
// Sums per-line EUR estimates from the ingredient price vocabulary across
// every meal slot of the week (a recipe cooked twice counts twice). Priced
// shopping lists are the product's wedge — this surfaces the same numbers on
// the plan itself.

export interface PlanCostEstimate {
  /** Sum of the priced lines, or null when nothing could be priced. */
  totalEur: number | null;
  pricedLines: number;
  totalLines: number;
}

export async function estimatePlanCostEur(
  days: { meals: { recipe: { ingredients: Ingredient[] } }[] }[],
): Promise<PlanCostEstimate> {
  const lines = days.flatMap((d) => d.meals.flatMap((m) => m.recipe.ingredients));
  if (lines.length === 0) return { totalEur: null, pricedLines: 0, totalLines: 0 };

  const names = [...new Set(lines.map((l) => normalizeIngredientName(l.name)))];
  const rows = await prisma.ingredientPrice.findMany({
    where: { ingredientName: { in: names } },
    select: {
      ingredientName: true,
      pricePer100gEur: true,
      pricePer100mlEur: true,
      pricePerPieceEur: true,
    },
  });
  const rowMap = new Map(rows.map((r) => [r.ingredientName, r]));

  let total = 0;
  let priced = 0;
  for (const line of lines) {
    const row = rowMap.get(normalizeIngredientName(line.name));
    const price = row ? estimateItemPriceEur(row, line.quantity, line.unit) : null;
    if (price != null) {
      total += price;
      priced += 1;
    }
  }

  return {
    totalEur: priced > 0 ? Math.round(total * 100) / 100 : null,
    pricedLines: priced,
    totalLines: lines.length,
  };
}
