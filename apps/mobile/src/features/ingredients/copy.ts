// ─── Ingredient search + custom ingredient copy (T-40.7–T-40.9, UX-40 slice 2) ─
// Every user-facing string for the ingredient search sheet, the custom
// ingredient sheet and the computed-nutrition card, kept together like
// apps/mobile/src/features/recipes/form/copy.ts.

export const ingredientsCopy = {
  search: {
    title: 'Add ingredient',
    placeholder: 'Search ingredient…',
    yourIngredients: 'YOUR INGREDIENTS',
    catalogue: 'CHEFER CATALOGUE',
    searching: 'Searching…',
    noMatches: 'No matches in the catalogue.',
    noMacrosYet: 'no macros yet',
    addAsMine: (text: string) => `＋ Add "${text}" as my ingredient`,
    useAsTyped: (text: string) => `Use "${text}" as typed · no nutrition`,
    linkedA11y: (name: string) => `${name}, nutrition known`,
  },
  custom: {
    title: 'New ingredient',
    description: 'Only you can see this ingredient. Nutrition values are per 100 g.',
    name: 'Name',
    nutritionHeading: 'Nutrition per 100 g',
    fillInForMe: 'Fill in for me',
    fillInEstimating: 'Estimating…',
    fillInLocked: 'Premium',
    fillInFromCatalog: 'Filled from the ingredient catalogue — adjust if needed.',
    fillInFromAi: 'Estimated — check against the label.',
    fillInError: 'Could not estimate nutrition right now. Fill it in manually.',
    gramsPerPiece: 'One piece weighs (g)',
    gramsPerPieceHint: 'optional — for countable items',
    save: 'Save ingredient',
    saving: 'Saving…',
  },
  nutrition: {
    eyebrow: 'Calculated',
    computing: 'Calculating…',
    addIngredients: 'Add ingredients to calculate nutrition automatically.',
    allMatched: (total: number) =>
      `Calculated from all ${total} ingredient${total === 1 ? '' : 's'}.`,
    someUnmatched: (matched: number, total: number, names: string[]) =>
      `From ${matched} of ${total} ingredients · no data for: ${names.join(', ')}`,
    offline: "Offline — showing the last calculated numbers. Will calculate when you're online.",
    editNumbers: 'Edit numbers',
  },
} as const;
