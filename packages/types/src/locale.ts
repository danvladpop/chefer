import { z } from 'zod';

// ─── UI language (ADR 0002, Lane J) ──────────────────────────────────────────
// The languages Chefer ships copy in. Catalogs live in @chefer/i18n; this is
// only the contract the API and both clients agree on. Adding a language here
// without a catalog fails the i18n catalog check.

export const SUPPORTED_LOCALES = ['en', 'ro'] as const;
export const supportedLocaleSchema = z.enum(SUPPORTED_LOCALES);
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * user.setLocale — additive. `locale` is the explicit choice from Settings
 * (null = "same as my phone"); `deviceLocale` is the supported language the
 * client resolved from the device or browser, so server-sent copy (emails)
 * follows a user who never opened the setting. Send at least one.
 */
export const setLocaleInputSchema = z
  .object({
    locale: supportedLocaleSchema.nullable().optional(),
    deviceLocale: supportedLocaleSchema.optional(),
  })
  .refine((v) => v.locale !== undefined || v.deviceLocale !== undefined, {
    message: 'Nothing to update',
  });
export type SetLocaleInput = z.infer<typeof setLocaleInputSchema>;
