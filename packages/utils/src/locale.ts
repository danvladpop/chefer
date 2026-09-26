import type { DisplayCurrency } from '@chefer/types';
import type { UnitSystem } from './units';

// ─── Location defaults (backlog P2-6) ─────────────────────────────────────────
// A new account starts in the unit system and currency of the device's region
// instead of metric + EUR for everyone. The client reads the region from the
// standard Intl APIs (no native dependency — Hermes ships them) and sends it
// with auth.register; the API maps it through defaultsForRegion below.

/** The world's non-metric holdouts: the US, Liberia and Myanmar. */
export const IMPERIAL_REGIONS: ReadonlySet<string> = new Set(['US', 'LR', 'MM']);

/**
 * Euro-area members (2026, incl. Bulgaria from 1 Jan 2026). Listed so the rule
 * is explicit; every region not mapped below falls back to EUR anyway.
 */
export const EUROZONE_REGIONS: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
]);

const CURRENCY_BY_REGION: Readonly<Record<string, DisplayCurrency>> = {
  US: 'USD',
  GB: 'GBP',
  RO: 'RON',
};

export type DisplayDefaults = { preferredUnits: UnitSystem; currency: DisplayCurrency };

/**
 * Unit system + currency for an ISO-3166 alpha-2 region. US/LR/MM → IMPERIAL,
 * everyone else METRIC. US → USD, GB → GBP, RO → RON, eurozone and everyone
 * else → EUR. Unknown / missing regions get METRIC + EUR.
 */
export function defaultsForRegion(region: string | null | undefined): DisplayDefaults {
  const r = (region ?? '').trim().toUpperCase();
  return {
    preferredUnits: IMPERIAL_REGIONS.has(r) ? 'IMPERIAL' : 'METRIC',
    currency: CURRENCY_BY_REGION[r] ?? 'EUR',
  };
}

/**
 * The region of a BCP-47 locale tag ("en-GB" → "GB", "ro_RO" → "RO"). A tag
 * without a region is maximised by Intl.Locale ("en" → "US") where available.
 */
export function regionFromLocale(locale: string | null | undefined): string | null {
  const tag = (locale ?? '').trim().replace(/_/g, '-');
  if (tag === '') return null;
  // An explicit two-letter region subtag wins ("en-GB", "zh-Hant-TW").
  const explicit = /-([A-Za-z]{2})(?:-|$)/.exec(tag);
  if (explicit?.[1]) return explicit[1].toUpperCase();
  try {
    const region = new Intl.Locale(tag).maximize().region;
    if (typeof region === 'string' && /^[A-Z]{2}$/.test(region)) return region;
  } catch {
    // Malformed tag — no region.
  }
  return null;
}

/**
 * Best-effort region of the current device/browser. Pass the platform's own
 * locale list first (web: navigator.languages); the Intl default locale is
 * the fallback. Returns null when nothing carries a region.
 */
export function detectRegion(
  preferredLocales: readonly (string | undefined)[] = [],
): string | null {
  const candidates = [...preferredLocales];
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl unavailable — only the passed locales count.
  }
  for (const locale of candidates) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }
  return null;
}
