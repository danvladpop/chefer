// ─── Body-weight input (audit F-DASH-3-1, F-GYM-2-2) ──────────────────────────
// One parser for every weight field on web and mobile, mirroring the API's
// tracker.logWeight bounds, so a typo (1000, 8, "1,5e3") is caught inline
// instead of poisoning the trend chart and the coach's weekly review.

/** Plausible adult body weight, kg. Matches the API's zod bounds. */
export const BODY_WEIGHT_KG_MIN = 20;
export const BODY_WEIGHT_KG_MAX = 400;

export type WeightParseResult = { ok: true; kg: number } | { ok: false; error: string };

/**
 * Parses a typed body weight. Accepts "72.5" and "72,5", rejects exponent
 * notation and anything outside 20–400 kg, and rounds to 0.1 kg.
 */
export function parseBodyWeightKg(input: string): WeightParseResult {
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: false, error: 'Enter your weight.' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use a number like 72.5.' };
  const kg = Math.round(Number(text) * 10) / 10;
  if (kg < BODY_WEIGHT_KG_MIN || kg > BODY_WEIGHT_KG_MAX) {
    return {
      ok: false,
      error: `Weight must be between ${BODY_WEIGHT_KG_MIN} and ${BODY_WEIGHT_KG_MAX} kg.`,
    };
  }
  return { ok: true, kg };
}

// ─── Weight-change tone (audit F-TRK-4-1) ─────────────────────────────────────
// Progress used to paint every gain red and every loss green — wrong for a
// user whose goal is to gain muscle. The tone follows the profile goal.

export type WeightChangeTone = 'positive' | 'negative' | 'neutral';

/** Changes smaller than this read as "no change" (entries are 0.1 kg precise). */
const WEIGHT_CHANGE_EPSILON_KG = 0.05;

/**
 * Whether a weight change is good news for this goal. Gaining is positive for
 * GAIN_MUSCLE, losing is positive for LOSE_WEIGHT; any other goal (maintain,
 * eat healthier, none set) has no direction, so the change stays neutral.
 */
export function weightChangeTone(
  deltaKg: number,
  goal: string | null | undefined,
): WeightChangeTone {
  if (!Number.isFinite(deltaKg) || Math.abs(deltaKg) < WEIGHT_CHANGE_EPSILON_KG) return 'neutral';
  if (goal === 'GAIN_MUSCLE') return deltaKg > 0 ? 'positive' : 'negative';
  if (goal === 'LOSE_WEIGHT') return deltaKg < 0 ? 'positive' : 'negative';
  return 'neutral';
}
