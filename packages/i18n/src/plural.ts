import type { SupportedLocale } from '@chefer/types';

// ─── Plural rules (CLDR) ─────────────────────────────────────────────────────
// Written out instead of calling Intl.PluralRules: Hermes (the mobile JS
// engine) does not ship it, and a polyfill would add ~20 KB for two rules.
//
// English: one = exactly 1, other = everything else ("1 recipe", "2 recipes").
// Romanian has three forms:
//   one   = exactly 1                              "1 rețetă"
//   few   = 0, a fraction, or 1–19 past a hundred  "2 rețete", "101 rețete"
//   other = the rest (20–99 past a hundred, whole hundreds)  "20 de rețete", "100 de rețete"
// https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html#ro

export type PluralCategory = 'one' | 'few' | 'other';

export function pluralCategory(locale: SupportedLocale, count: number): PluralCategory {
  const n = Math.abs(count);
  const isInteger = Number.isInteger(n);
  if (n === 1) return 'one';
  if (locale === 'ro') {
    const mod100 = n % 100;
    if (!isInteger || n === 0 || (mod100 >= 1 && mod100 <= 19)) return 'few';
  }
  return 'other';
}

/** The plural categories each locale's catalog must spell out. */
export const PLURAL_CATEGORIES: Readonly<Record<SupportedLocale, readonly PluralCategory[]>> = {
  en: ['one', 'other'],
  ro: ['one', 'few', 'other'],
};
