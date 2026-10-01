// ─── Quantity rounding for scaled recipes ─────────────────────────────────────
// The old AI macro reconciliation (audit F-REC-2-4: scale quantities toward the
// AI's STATED calories using the AI-estimated price vocabulary) was replaced by
// the ingredient catalog (plan-ingredient-catalog §6.3): AI recipes are now
// computed from catalog slugs and scaled toward the slot target from the
// user's plan (ai-recipe-catalog.ts `fitToSlotTarget`), which reuses this.

/** Rounds a scaled quantity to something a cook would measure. */
export function roundQuantity(quantity: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (/^(g|ml|gram|grams)\b/.test(u)) {
    return quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.max(1, Math.round(quantity));
  }
  if (/^(tsp|tbsp|teaspoon|tablespoon|cup)/.test(u)) {
    return Math.max(0.25, Math.round(quantity * 4) / 4);
  }
  return Math.max(0.5, Math.round(quantity * 2) / 2);
}
