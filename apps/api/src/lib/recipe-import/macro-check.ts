// ─── Macro types (pre-catalog) ────────────────────────────────────────────────
// `crossCheckMacros` — the AI-calorie sanity check against the AI-estimated
// price vocabulary — was removed with the ingredient catalog (plan §6.2):
// import nutrition is now computed, never the AI's. What remains:
//   - MacroVocabularyRow: the legacy vocabulary row plan reconcile still reads
//     until P7 repurposes it;
//   - MacroCheckResult: the shape of `importPreview.macroCheck`, kept for
//     installed clients (now derived from the catalog computation).

export interface MacroVocabularyRow {
  ingredientName: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  gramsPerPiece: number | null;
}

export interface MacroCheckResult {
  /** 'ok' — every line computes from the catalog; 'unknown' — some lines have
   *  no data. ('uncertain' is no longer produced.) */
  status: 'ok' | 'uncertain' | 'unknown';
  /** Vocabulary-computed kcal per serving. Null when status is 'unknown', and
   *  also when the computed number is implausibly far (>3×) from the stated
   *  one — uncertain, but not worth quoting. */
  computedCaloriesPerServing: number | null;
  statedCaloriesPerServing: number;
  matchedLines: number;
  totalLines: number;
}
