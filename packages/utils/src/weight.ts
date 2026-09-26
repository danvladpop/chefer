import { LB_PER_KG } from '@chefer/types';
import type { UnitSystem } from './units';

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

// ─── Body weight in the user's unit (backlog P2-6, audit F-X-8-2) ────────────
// The API stores and validates kg. IMPERIAL users see and type pounds; the
// client converts at the edge with these helpers so every screen agrees.

/** 20–400 kg expressed in pounds (44 lb → 20.0 kg, 881 lb → 399.6 kg). */
export const BODY_WEIGHT_LB_MIN = 44;
export const BODY_WEIGHT_LB_MAX = 881;

/** "kg" or "lb" for the user's unit system. */
export function bodyWeightUnit(system: UnitSystem): 'kg' | 'lb' {
  return system === 'IMPERIAL' ? 'lb' : 'kg';
}

/** kg → the user's unit, rounded to 0.1 (72.5 kg → 159.8 lb). */
export function bodyWeightInUnit(kg: number, system: UnitSystem): number {
  const value = system === 'IMPERIAL' ? kg * LB_PER_KG : kg;
  return Math.round(value * 10) / 10;
}

/**
 * "72.5 kg" / "159.8 lb". With `signed`, a change reads "+1.2 kg" / "-0.4 lb"
 * (one decimal always, so deltas line up).
 */
export function formatBodyWeight(
  kg: number,
  system: UnitSystem,
  options: { signed?: boolean } = {},
): string {
  const value = bodyWeightInUnit(kg, system);
  const unit = bodyWeightUnit(system);
  if (options.signed) return `${value > 0 ? '+' : ''}${value.toFixed(1)} ${unit}`;
  return `${value} ${unit}`;
}

/**
 * The coach's weekly weight trend chip: "−0.4 kg/wk", "+0.9 lb/wk" or
 * "steady" under 0.05 kg; null when there is no trend yet.
 */
export function formatWeightTrend(trendKg: number | null, system: UnitSystem): string | null {
  if (trendKg === null) return null;
  if (Math.abs(trendKg) < 0.05) return 'steady';
  const abs = Math.abs(bodyWeightInUnit(trendKg, system)).toFixed(1);
  return `${trendKg < 0 ? '−' : '+'}${abs} ${bodyWeightUnit(system)}/wk`;
}

/**
 * Parses a body weight typed in the user's unit and returns kg for the API.
 * METRIC behaves exactly like parseBodyWeightKg; IMPERIAL accepts 44–881 lb
 * (the same 20–400 kg range) with the error copy in pounds.
 */
export function parseBodyWeight(input: string, system: UnitSystem): WeightParseResult {
  if (system !== 'IMPERIAL') return parseBodyWeightKg(input);
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: false, error: 'Enter your weight.' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use a number like 160.5.' };
  const lb = Number(text);
  if (lb < BODY_WEIGHT_LB_MIN || lb > BODY_WEIGHT_LB_MAX) {
    return {
      ok: false,
      error: `Weight must be between ${BODY_WEIGHT_LB_MIN} and ${BODY_WEIGHT_LB_MAX} lb.`,
    };
  }
  return { ok: true, kg: Math.round((lb / LB_PER_KG) * 10) / 10 };
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
