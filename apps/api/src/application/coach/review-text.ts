import { aiService } from '../../lib/ai/index.js';
import { env } from '../../lib/env.js';
import { buildTemplateReviewText, type ReviewTextInput } from './review.service.js';

// ─── Review prose (F1) ────────────────────────────────────────────────────────
// Goes through IAIService.generateReviewText (audit P0-5 groundwork), so the
// review follows the configured provider chain like every other AI call. In
// mock mode, or when the live call fails or returns nothing, it degrades to
// the deterministic template so the Sunday sweep NEVER fails on prose.

/**
 * Returns the weekly review prose and where it came from (`aiGenerated` is
 * true only for live model output — the template and the mock are not AI, so
 * the "AI-generated" label never lands on them; App Review R-14). Live AI when
 * configured, otherwise (mock mode or any call failure) the template string.
 *
 * `lib/ai/types.ts`'s `CoachReviewInput` (not owned by this lane) still names
 * the field `adjustmentKcal` — mapped here from `proposedAdjustmentKcal`
 * (§2.11, T-35.4: the coach proposes, it never applies). A handoff request
 * covers renaming it and the "adjusted by" → "suggests" wording in
 * `lib/ai/prompts.ts` L450-465 (owned by L-PLAN).
 */
export async function generateReviewTextWithSource(
  input: ReviewTextInput,
): Promise<{ text: string; aiGenerated: boolean }> {
  const aiInput = { ...input, adjustmentKcal: input.proposedAdjustmentKcal };
  if (env.AI_MOCK_ENABLED) return { text: buildTemplateReviewText(input), aiGenerated: false };

  try {
    const text = (await aiService.generateReviewText(aiInput)).trim();
    return text
      ? { text, aiGenerated: true }
      : { text: buildTemplateReviewText(input), aiGenerated: false };
  } catch (err) {
    console.error('[coach] review text generation failed, using template:', err);
    return { text: buildTemplateReviewText(input), aiGenerated: false };
  }
}

/** Same as {@link generateReviewTextWithSource}, text only. */
export async function generateReviewText(input: ReviewTextInput): Promise<string> {
  return (await generateReviewTextWithSource(input)).text;
}
