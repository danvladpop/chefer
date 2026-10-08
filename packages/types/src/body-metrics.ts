import { z } from 'zod';

// ─── Body-metric age rules (App Review R-02, Guideline 1.4.1) ───────────────────
// One place for the numbers every platform and the API share. Chefer is for
// people aged 16 and over (sign-up checkbox, privacy policy), so body metrics
// are never accepted for younger users, and under 18 the app never sets a
// calorie deficit.

/** Youngest age Chefer accepts for body metrics (matches the sign-up 16+ gate). */
export const MIN_BODY_METRICS_AGE = 16;

/** Oldest age accepted for body metrics (unchanged from before). */
export const MAX_BODY_METRICS_AGE = 110;

/** Below this age the suggested target is never a calorie deficit. */
export const ADULT_AGE = 18;

/** Friendly validation message for an age below the minimum. */
export const MIN_AGE_MESSAGE = 'Chefer is for people aged 16 and over.';

/** Shown next to the calorie target when a deficit goal was turned into maintenance. */
export const MINOR_NO_DEFICIT_NOTE =
  "Under 18 we don't set a calorie deficit — your target is maintenance. Talk to a doctor before trying to lose weight.";

/** Zod schema for the age field on every write path (new writes only; stored ages are never re-validated). */
export const bodyMetricsAgeSchema = z
  .number()
  .int()
  .min(MIN_BODY_METRICS_AGE, MIN_AGE_MESSAGE)
  .max(MAX_BODY_METRICS_AGE);

/** True when `age` is a valid new-write age (integer within the allowed range). */
export function isValidBodyMetricsAge(age: number): boolean {
  return Number.isInteger(age) && age >= MIN_BODY_METRICS_AGE && age <= MAX_BODY_METRICS_AGE;
}

/**
 * Form-side check for the age field: null when the age is fine or still empty,
 * otherwise the message to show under the field. Used by the web and mobile
 * forms so the copy matches the server's BAD_REQUEST message.
 */
export function bodyMetricsAgeError(age: number | null | undefined): string | null {
  if (age === null || age === undefined || Number.isNaN(age)) return null;
  if (age < MIN_BODY_METRICS_AGE) return MIN_AGE_MESSAGE;
  if (age > MAX_BODY_METRICS_AGE) return `Enter an age of ${MAX_BODY_METRICS_AGE} or under.`;
  return null;
}

// ─── Height / weight plausibility (UX-ONB-05) ──────────────────────────────────
// "1,80" used to save `heightCm: 1.8` and an 8 kg weight produced a calorie
// target. These bounds are the one place every form checks typed values
// against — onboarding, Preferences and web. The API inputs already reject
// non-positive values and anything above 300 cm / 500 kg; they stay that wide
// on purpose (app builds already in the field send whatever their form let
// through), so these bounds are enforced where the value is typed.

/** Shortest height accepted from a form, in centimetres. */
export const MIN_HEIGHT_CM = 100;
/** Tallest height accepted from a form, in centimetres. */
export const MAX_HEIGHT_CM = 250;
/** Lightest body weight accepted from a form, in kilograms. */
export const MIN_WEIGHT_KG = 20;
/** Heaviest body weight accepted from a form, in kilograms. */
export const MAX_WEIGHT_KG = 400;

const CM_PER_INCH = 2.54;
const POUNDS_PER_KG = 2.2046226218;

export type BodyUnits = 'METRIC' | 'IMPERIAL';

/** True when `cm` is a plausible adult height (inclusive bounds). */
export function isPlausibleHeightCm(cm: number): boolean {
  return Number.isFinite(cm) && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
}

/** True when `kg` is a plausible adult body weight (inclusive bounds). */
export function isPlausibleWeightKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

/**
 * Form-side check for height: null when empty or plausible, otherwise the
 * message for under the field, phrased in the unit the user is typing in.
 */
export function bodyMetricsHeightError(
  cm: number | null | undefined,
  units: BodyUnits = 'METRIC',
): string | null {
  if (cm === null || cm === undefined || Number.isNaN(cm)) return null;
  if (isPlausibleHeightCm(cm)) return null;
  if (units === 'IMPERIAL') {
    const lo = Math.ceil(MIN_HEIGHT_CM / CM_PER_INCH);
    const hi = Math.floor(MAX_HEIGHT_CM / CM_PER_INCH);
    return `Enter a height between ${Math.floor(lo / 12)} ft ${lo % 12} in and ${Math.floor(hi / 12)} ft ${hi % 12} in.`;
  }
  return `Enter a height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`;
}

/** Form-side check for weight — see {@link bodyMetricsHeightError}. */
export function bodyMetricsWeightError(
  kg: number | null | undefined,
  units: BodyUnits = 'METRIC',
): string | null {
  if (kg === null || kg === undefined || Number.isNaN(kg)) return null;
  if (isPlausibleWeightKg(kg)) return null;
  if (units === 'IMPERIAL') {
    return `Enter a weight between ${Math.ceil(MIN_WEIGHT_KG * POUNDS_PER_KG)} and ${Math.floor(MAX_WEIGHT_KG * POUNDS_PER_KG)} lb.`;
  }
  return `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
}
