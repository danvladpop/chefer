import { aiService } from '../../lib/ai/index.js';
import { env } from '../../lib/env.js';
import { buildTemplateReviewText, type ReviewTextInput } from './review.service.js';

// ─── Review prose (F1) ────────────────────────────────────────────────────────
// Goes through IAIService.generateReviewText (audit P0-5 groundwork), so the
// review follows the configured provider chain like every other AI call. In
// mock mode, or when the live call fails or returns nothing, it degrades to
// the deterministic template so the Sunday sweep NEVER fails on prose.

/**
 * Returns the weekly review prose. Live AI when configured, otherwise
 * (mock mode or any call failure) the template string.
 */
export async function generateReviewText(input: ReviewTextInput): Promise<string> {
  if (env.AI_MOCK_ENABLED) return buildTemplateReviewText(input);

  try {
    const text = (await aiService.generateReviewText(input)).trim();
    return text || buildTemplateReviewText(input);
  } catch (err) {
    console.error('[coach] review text generation failed, using template:', err);
    return buildTemplateReviewText(input);
  }
}
