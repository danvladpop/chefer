import { z } from 'zod';

// ─── Numbers mode (WP-08 protein-only mode; WP-16 "no numbers") ──────────────────
// How much nutrition arithmetic a user wants to see. Stored as a nullable
// string on `ChefProfile.numbersMode` (not a Prisma enum, so a new mode is
// never a migration). `null` means FULL.
//
//   FULL          calories, macros, rings — the original experience
//   PROTEIN_ONLY  one number: protein (ring "72 of 120 g protein", a per-meal
//                 guide). Planning still balances kcal underneath.
//   NONE          reserved for WP-16: accepted by the schema now, treated as
//                 FULL by clients until WP-16 ships (`effectiveNumbersMode`).
//
// Old app builds ignore the field and keep showing full numbers.

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

/**
 * The mode clients should render today: null/unknown/`NONE` map to `FULL`
 * (NONE has no UI until WP-16). Accepts the raw stored string.
 */
export function effectiveNumbersMode(mode: string | null | undefined): 'FULL' | 'PROTEIN_ONLY' {
  return mode === 'PROTEIN_ONLY' ? 'PROTEIN_ONLY' : 'FULL';
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
