// ─── Ingredient search + custom ingredient copy (T-40.7–T-40.9, UX-40 slice 2) ─
// Mobile-only strings for the ingredient sheets and the computed-nutrition
// card. Everything web shares (statuses, picker, private-ingredient sheet,
// import review) lives in INGREDIENT_CATALOG_COPY in @chefer/types
// (plan-ingredient-catalog §10).

export const ingredientsCopy = {
  custom: {
    fillInForMe: 'Fill in for me',
    fillInEstimating: 'Estimating…',
    fillInLocked: 'Premium',
    fillInFromCatalog: 'Filled from the ingredient catalog — adjust if needed.',
    fillInFromAi: 'Suggested — check every value against the label.',
    fillInError: 'Could not fill this in right now. Copy the values from the label.',
  },
  nutrition: {
    eyebrow: 'Calculated',
    computing: 'Calculating…',
    addIngredients: 'Add ingredients to calculate nutrition automatically.',
    offline: "Offline — some ingredients can't be loaded until you're back online.",
  },
} as const;
