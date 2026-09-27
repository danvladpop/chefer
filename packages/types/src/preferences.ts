import { z } from 'zod';

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
