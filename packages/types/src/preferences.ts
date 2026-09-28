import { z } from 'zod';

// ─── Goals (§2.11, T-35.2, rev 2) ───────────────────────────────────────────────
// The canonical goal enum, additive over the original four: RECOMP and
// PERFORMANCE. `chefer/database`'s Prisma `Goal` enum is the source of truth
// (already has all six from wave 0); this is the string-literal mirror
// clients and the API's zod schemas use without importing the Prisma runtime.
// Old clients (no `x-chefer-api-level >= 1`) render a fixed GOALS list that
// predates the new two — `preferences.get` maps them to MAINTAIN in
// `chefProfile.goal` for those clients and carries the true value in the
// additive `goalV2` field.

export const GOAL_VALUES = [
  'LOSE_WEIGHT',
  'MAINTAIN',
  'GAIN_MUSCLE',
  'EAT_HEALTHIER',
  'RECOMP',
  'PERFORMANCE',
] as const;
export const goalSchema = z.enum(GOAL_VALUES);
export type GoalValue = (typeof GOAL_VALUES)[number];

/** Goals a level-0 client's fixed GOALS list can't render (T-35.2). */
export const LEVEL_0_UNKNOWN_GOALS: ReadonlySet<GoalValue> = new Set(['RECOMP', 'PERFORMANCE']);

// ─── Display preferences (backlog P2-6; audit F-X-8-2, F-DASH-3-2) ────────────
// One unit system and one currency per user, editable on EVERY tier and
// applied on web and mobile alike. The API keeps storing kg and EUR; clients
// convert for display through the shared helpers in @chefer/utils.

export const UNIT_SYSTEMS = ['METRIC', 'IMPERIAL'] as const;
export const unitSystemSchema = z.enum(UNIT_SYSTEMS);

/** Currencies the price display supports (prices are estimated in EUR). */
export const DISPLAY_CURRENCIES = ['EUR', 'USD', 'GBP', 'RON'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const displayCurrencySchema = z.enum(DISPLAY_CURRENCIES);

/** ISO-3166 alpha-2 region ("US", "gb"), normalised to upper case. */
export const regionCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Region must be a two-letter country code')
  .transform((r) => r.toUpperCase());

/**
 * IANA time zone name ("Europe/Bucharest", "UTC") — §2.12, T-21.1. Validated
 * by asking `Intl` to accept it rather than a hand-rolled regex, so every
 * real zone name (including the odd "Etc/GMT+5" ones) passes.
 */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Not a recognised time zone');

/**
 * preferences.setDisplayPreferences — free for every tier. `timeZone`
 * (§2.12, T-21.1) is additive: server-initiated work (the weekly worker, the
 * quiet-days nudge text) reads `ChefProfile.timeZone`; clients that don't
 * send it leave it unset and nothing regresses.
 */
export const setDisplayPreferencesInputSchema = z
  .object({
    preferredUnits: unitSystemSchema.optional(),
    currency: displayCurrencySchema.optional(),
    timeZone: timeZoneSchema.optional(),
  })
  .refine(
    (v) => v.preferredUnits !== undefined || v.currency !== undefined || v.timeZone !== undefined,
    { message: 'Nothing to update' },
  );
export type SetDisplayPreferencesInput = z.infer<typeof setDisplayPreferencesInputSchema>;
