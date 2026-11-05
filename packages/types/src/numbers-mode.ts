import { z } from 'zod';

// ─── Numbers mode (WP-08 protein-only mode; WP-16 "no numbers") ──────────────────
// How much nutrition arithmetic a user wants to see. Stored as a nullable
// string on `ChefProfile.numbersMode` (not a Prisma enum, so a new mode is
// never a migration). `null` means FULL.
//
//   FULL          calories, macros, rings — the original experience
//   PROTEIN_ONLY  one number: protein (ring "72 of 120 g protein", a per-meal
//                 guide). Planning still balances kcal underneath.
//   NONE          "Hide numbers" (market review 2026-10, lane E3): no calories
//                 and no macro numbers anywhere — portions, "on plan" ticks and
//                 qualitative progress instead. The ED-safe option, free for
//                 every tier. Planning still balances kcal underneath.
//
// Old app builds ignore the field and keep showing full numbers (an installed
// binary's JS from before E3 maps NONE to FULL).

export const NUMBERS_MODES = ['FULL', 'PROTEIN_ONLY', 'NONE'] as const;
export const numbersModeSchema = z.enum(NUMBERS_MODES);
export type NumbersMode = z.infer<typeof numbersModeSchema>;

/** `preferences.setNumbersMode` input. */
export const setNumbersModeInputSchema = z.object({
  numbersMode: numbersModeSchema,
});
export type SetNumbersModeInput = z.infer<typeof setNumbersModeInputSchema>;

/** A stored `ChefProfile.numbersMode` string as a `NumbersMode`, or null when unset or unknown. */
export function parseStoredNumbersMode(raw: string | null | undefined): NumbersMode | null {
  const parsed = numbersModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type EffectiveNumbersMode = NumbersMode;

/** The mode clients render: null/unknown map to `FULL`. Accepts the raw stored string. */
export function effectiveNumbersMode(mode: string | null | undefined): EffectiveNumbersMode {
  return parseStoredNumbersMode(mode) ?? 'FULL';
}

/**
 * Which nutrition numbers a mode shows — the ONE rule every surface follows:
 * FULL shows everything, PROTEIN_ONLY only protein, NONE nothing (lane E3).
 */
export function numbersVisibility(mode: EffectiveNumbersMode): {
  kcal: boolean;
  macros: boolean;
  protein: boolean;
} {
  return {
    kcal: mode === 'FULL',
    macros: mode === 'FULL',
    protein: mode !== 'NONE',
  };
}

/**
 * Per-meal protein guide (D-5), additive on `dashboard.summary.proteinGuide`
 * and `tracker.getDay.proteinGuide`. Built by `buildProteinGuide` (@chefer/utils).
 */
export interface ProteinGuide {
  /** The effective daily protein target (g) — `resolveTargets`' number. */
  proteinG: number;
  /** Planned meals the target was divided across (>= 1). */
  meals: number;
  /** target ÷ meals, unrounded, one decimal. */
  perMealG: number;
  /** Lower / upper end of the 10 g-wide, 5 g-aligned range around `perMealG`. */
  lowG: number;
  highG: number;
  /** Ready-to-render copy, e.g. "30–40 g per meal". */
  label: string;
}

export const PROTEIN_WHY_REASONS = ['OWN', 'LIFTER_GOAL', 'GOAL_SPLIT', 'NO_WEIGHT'] as const;
export type ProteinWhyReason = (typeof PROTEIN_WHY_REASONS)[number];

/**
 * Data for the "Why this protein number?" sheet, additive on `targets.get`
 * as `proteinWhy`. Built by `explainProteinTarget` (@chefer/utils).
 */
export interface ProteinWhy {
  /** The user's effective protein target (g/day). */
  effectiveG: number;
  /** effectiveG ÷ weightKg, one decimal; null without a weight. */
  gPerKg: number | null;
  /** The research default (1.6 g per kg). */
  referenceGPerKg: number;
  /** 1.6 g/kg × weight, rounded; null without a weight. */
  referenceG: number | null;
  /** True when the effective target is not within tolerance of 1.6 g/kg. */
  differs: boolean;
  reason: ProteinWhyReason;
  /** Plain-English explanation, safe to render as-is. */
  sentence: string;
}
