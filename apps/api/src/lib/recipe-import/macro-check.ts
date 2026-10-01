// ─── Macro types (pre-catalog) ────────────────────────────────────────────────
// `crossCheckMacros` — the AI-calorie sanity check against the AI-estimated
// price vocabulary — was removed with the ingredient catalog (plan §6.2):
// import nutrition is now computed, never the AI's. What remains:
//   - MacroCheckResult: the shape of `importPreview.macroCheck`, kept for
//     installed clients (now derived from the catalog computation).

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
