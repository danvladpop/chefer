import { GoogleGenAI } from '@google/genai';
import { env } from '../../lib/env.js';
import { buildTemplateReviewText, type ReviewTextInput } from './review.service.js';

// ─── Review prose (F1) ────────────────────────────────────────────────────────
// Deliberately NOT an IAIService method: the review is one small text call
// with its own prompt and fallback story, and the shared interface is under
// the wave-1 keep-it-lean rule (premium_plan.md W1-A#2). This module follows
// the same Gemini SDK pattern as lib/ai/gemini.ts; in mock mode (or when the
// live call fails) it degrades to the deterministic template so the Sunday
// sweep NEVER fails on prose.

const MODEL = 'gemini-2.5-flash';

const REVIEW_SYSTEM_PROMPT = `\
You are Chefer, the user's warm, personal chef writing their weekly review.
Write 4-5 short lines (separated by newlines, no bullets, no markdown, no
greeting, no sign-off). Be specific to THEIR numbers, encouraging and human.

Hard rules:
- The FIRST line must stand alone as a one-sentence summary of their week.
- Plain kitchen language only. NEVER mention BMR, TDEE, EWMA, algorithms,
  formulas or "the system".
- You are a chef, not a doctor: no medical claims, no diagnoses, no advice
  about health conditions. Food, habits and next week's cooking only.
- If their calorie budget changed, present it as YOUR decision as their chef
  ("I've trimmed next week's budget by 100 kcal") — never as math.
- If adherence was low, coach the logging habit warmly instead of the numbers.`;

function buildReviewUserPrompt(input: ReviewTextInput): string {
  const lines = [
    `Days logged this week: ${input.loggedDays} of 7 (${input.adherencePct}% adherence).`,
    `Average intake on logged days: ${input.avgDailyKcal} kcal vs a ${input.targetKcal} kcal daily target.`,
    input.weightTrendKg !== null
      ? `Weight trend: ${input.weightTrendKg > 0 ? '+' : ''}${input.weightTrendKg.toFixed(2)} kg per week.`
      : 'Weight trend: not enough weigh-ins yet.',
    `Goal: ${input.goal ?? 'MAINTAIN'}.`,
    input.adjustmentKcal !== 0
      ? `Decision already made: next week's calorie budget changes by ${input.adjustmentKcal > 0 ? '+' : ''}${input.adjustmentKcal} kcal. State it as your call.`
      : 'Decision already made: the calorie budget stays as it is.',
  ];
  if (input.dishNames.length > 0) {
    lines.push(`Dishes on their plan this week: ${input.dishNames.slice(0, 10).join(', ')}.`);
  }
  return lines.join('\n');
}

/**
 * Returns the weekly review prose. Live Gemini when configured, otherwise
 * (mock mode, other provider, or any call failure) the template string.
 */
export async function generateReviewText(input: ReviewTextInput): Promise<string> {
  if (env.AI_MOCK_ENABLED || env.AI_PROVIDER !== 'gemini' || !env.GEMINI_API_KEY) {
    return buildTemplateReviewText(input);
  }

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: MODEL,
      contents: buildReviewUserPrompt(input),
      config: {
        systemInstruction: REVIEW_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = response.text?.trim();
    if (!text) return buildTemplateReviewText(input);
    return text;
  } catch (err) {
    console.error('[coach] review text generation failed, using template:', err);
    return buildTemplateReviewText(input);
  }
}
