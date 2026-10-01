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
