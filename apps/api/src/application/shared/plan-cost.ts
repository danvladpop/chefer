import { prisma } from '@chefer/database';
import { slotPortion } from '@chefer/utils';
import type { Ingredient } from '../../lib/ai/types.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
} from '../../lib/ingredient-prices/index.js';
import { aggregateIngredientLines, formatLineQuantity } from '../shopping-list/aggregate.js';
import { householdScaleFactor } from './household-scale.js';

// ─── Weekly plan cost estimation (P2-4) ───────────────────────────────────────
// Sums per-line EUR estimates from the ingredient price vocabulary across
// every meal slot of the week (a recipe cooked twice counts twice). Priced
// shopping lists are the product's wedge — this surfaces the same numbers on
// the plan itself.
//
// It prices the SAME aggregated lines the shopping list shows (aggregate.ts),
// so the chip equals the list total unless the list adds custom items or
// subtracts pantry stock — both visible on the list (audit F-SHOP-1-3; they
// disagreed by ~€19 with nothing on screen to explain it).

export interface PlanCostEstimate {
  /** Sum of the priced lines, or null when nothing could be priced. */
  totalEur: number | null;
  pricedLines: number;
  totalLines: number;
  /**
   * Portions the total is sized for — present only when a premium
   * household's cost was scaled to the whole table (backlog P2-3). Clients
   * divide by THIS for the per-person figure, never by the head count of a
   * single-portion list (audit F-PM-5). Additive.
   */
  portions?: number;
}

export async function estimatePlanCostEur(
  days: {
    meals: {
      recipe: { id?: string; ingredients: Ingredient[]; servings?: number };
      portion?: number | undefined;
    }[];
  }[],
  options: { portions?: number | null } = {},
): Promise<PlanCostEstimate> {
  const portions = options.portions ?? null;
  const lines = aggregateIngredientLines(
    days.flatMap((d) =>
      d.meals.flatMap((m) => {
        const factor = householdScaleFactor(m.recipe.servings, portions);
        return m.recipe.ingredients.map((ing) => ({
          name: ing.name,
          // P1-1: a 1.5× slot buys 1.5× the recipe; P2-3: a premium table
          // multiplies that by portions ÷ servings (same rule as the list).
          quantity: ing.quantity * slotPortion(m.portion) * factor,
          unit: ing.unit,
          recipeId: m.recipe.id ?? '',
        }));
      }),
    ),
  );
  const sized = portions != null ? { portions } : {};
  if (lines.length === 0) return { totalEur: null, pricedLines: 0, totalLines: 0, ...sized };

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
    // Same quantity string the list prices (formatLineQuantity), so rounding
    // can't make the two totals drift apart.
    const quantity = parseFloat(formatLineQuantity(line.quantity));
    const price = row ? estimateItemPriceEur(row, quantity, line.unit) : null;
    if (price != null) {
      total += price;
      priced += 1;
    }
  }

  return {
    totalEur: priced > 0 ? Math.round(total * 100) / 100 : null,
    pricedLines: priced,
    totalLines: lines.length,
    ...sized,
  };
}
