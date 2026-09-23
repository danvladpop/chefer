import type { ExtractionConfidence } from '../ai/types.js';

// ─── Serving-count trust ─────────────────────────────────────────────────────
// `servings` is the least reliable field in a short-video extraction, and the
// most damaging when wrong: nutritionInfo is PER SERVING, so the count is the
// multiplier on every macro the meal planner reads.
//
// Measured on one reel across five runs, the same clip yielded 2, 3, 5, 5 and 2
// servings. The caption gave a portion size ("about 3 tenders per serving") but
// never a total, so the model had to guess the yield — and guessed differently
// each time. Asking it in the prompt to lower its own confidence when it had to
// derive the number did not work: it still reported "high".
//
// So the check moves out of the prompt and into code. A model cannot be trusted
// to report that it guessed; the caption either contains an explicit count or
// it does not, and that is a fact we can check ourselves.

/**
 * Matches an explicit serving count a creator actually wrote:
 * "serves 4", "4 servings", "makes 6 portions", "yields 12".
 *
 * Deliberately NOT matched: "about 3 tenders per serving" — a portion size,
 * which is what forces the guess in the first place.
 */
const EXPLICIT_SERVINGS =
  /\b(?:serves|makes|yields?)\s*:?\s*(\d+)|(\d+)\s*(?:servings?|portions?)\b/i;

/** True when the caption states how many servings the recipe makes. */
export function captionStatesServings(caption: string): boolean {
  const match = EXPLICIT_SERVINGS.exec(caption);
  if (!match) return false;
  // "per serving" / "1 serving" phrasing describes a portion, not a yield.
  return !/per\s+serving/i.test(caption.slice(Math.max(0, match.index - 12), match.index + 20));
}

const RANK: Record<ExtractionConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Lowers `confidence` to `ceiling` when it currently claims more. */
export function capConfidence(
  confidence: ExtractionConfidence,
  ceiling: ExtractionConfidence,
): ExtractionConfidence {
  return RANK[confidence] > RANK[ceiling] ? ceiling : confidence;
}

export const DERIVED_SERVINGS_NOTE =
  'Serving count was NOT stated by the creator — the model derived it, and derives it differently on repeat runs. Verify it before publishing: it scales every per-serving macro.';
