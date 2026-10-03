import type { DisplayCurrency } from '@chefer/types';
import { formatMoney } from './currency';
import { formatQuantity, type UnitSystem } from './units';

// ─── One formatter set, device locale (WP-11, UX-X-15) ────────────────────────
// Dates and numbers used to be formatted with a hard-coded `en-GB` / `en-US`
// per screen, so a German phone read "3 Oct" next to "1,800" in the same list.
// Every formatter here takes an optional `locale` (tests pass one) and
// otherwise follows the DEVICE locale: Hermes and every browser resolve the
// default `Intl` locale from the OS language settings.

/** The device's `Intl` locale tag ("en-GB", "ro-RO"); "en-US" when `Intl` can't say. */
export function deviceLocale(): string {
  try {
    return new Intl.NumberFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

function safeLocale(locale: string | undefined): string {
  return locale && locale.trim() !== '' ? locale : deviceLocale();
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

/** A number with the locale's grouping and decimal separators ("1,800" / "1.800"). */
export function formatNumber(
  value: number,
  options: { locale?: string; maximumFractionDigits?: number } = {},
): string {
  if (!Number.isFinite(value)) return String(value);
  const locale = safeLocale(options.locale);
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: options.maximumFractionDigits ?? 0,
    }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

/** Calories as a whole, grouped number: `formatKcal(1800)` → "1,800" (no unit; callers add " kcal"). */
export function formatKcal(kcal: number, locale?: string): string {
  return formatNumber(Math.round(kcal), locale === undefined ? {} : { locale });
}

/**
 * "2 kg", "1.5 lb", "3" — a list quantity in the user's unit system with the
 * device locale's decimal separator. A missing unit is a bare count.
 */
export function formatQty(
  quantity: number,
  unit: string | null | undefined,
  system: UnitSystem = 'METRIC',
  locale?: string,
): string {
  return formatQuantity(quantity, (unit ?? '').trim(), system, safeLocale(locale));
}

// ─── Money ────────────────────────────────────────────────────────────────────

/**
 * A price an estimate can honestly claim: whole currency units ("~€7"), never
 * to the cent. Under one unit it says so ("<€1") instead of rounding a
 * 40-cent herb to a full euro. Callers add their own "~".
 */
export function formatApproxPrice(
  amountEur: number,
  currency: DisplayCurrency,
  locale?: string,
): string {
  const options = { decimals: 0, locale: safeLocale(locale) };
  if (amountEur < 0.5) return `<${formatMoney(1, currency, options)}`;
  return formatMoney(amountEur, currency, options);
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** Named date shapes, so no screen hand-writes an `Intl` options object. */
export type DateStyle =
  /** "3 Oct" */
  | 'short'
  /** "3 October" */
  | 'long'
  /** "3 Oct 2026" */
  | 'medium'
  /** "3 October 2026" */
  | 'full'
  /** "Sat" */
  | 'weekday'
  /** "Saturday" */
  | 'weekday-long'
  /** "Sat, 3 Oct" */
  | 'weekday-short'
  /** "Saturday, 3 October" */
  | 'weekday-long-date'
  /** "Saturday, 3 Oct" */
  | 'weekday-long-short'
  /** "Oct" */
  | 'month'
  /** "3 Oct 2026, 14:30" */
  | 'datetime';

const DATE_OPTIONS: Readonly<Record<DateStyle, Intl.DateTimeFormatOptions>> = {
  short: { day: 'numeric', month: 'short' },
  long: { day: 'numeric', month: 'long' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  full: { day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'short' },
  'weekday-long': { weekday: 'long' },
  'weekday-short': { weekday: 'short', day: 'numeric', month: 'short' },
  'weekday-long-date': { weekday: 'long', day: 'numeric', month: 'long' },
  'weekday-long-short': { weekday: 'long', day: 'numeric', month: 'short' },
  month: { month: 'short' },
  datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
};

export type FormatDateOptions = {
  locale?: string;
  /** IANA zone; pass "UTC" for a calendar day stored as UTC midnight. */
  timeZone?: string;
};

function toValidDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date in the device locale: `formatDate(d, 'short')` → "3 Oct" (en-GB) / "Oct 3" (en-US). */
export function formatDate(
  value: Date | string | number,
  style: DateStyle = 'medium',
  options: FormatDateOptions = {},
): string {
  const date = toValidDate(value);
  if (!date) return '';
  const locale = safeLocale(options.locale);
  try {
    return new Intl.DateTimeFormat(locale, {
      ...DATE_OPTIONS[style],
      ...(options.timeZone && { timeZone: options.timeZone }),
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/** "3 Oct – 9 Oct" in the device locale. */
export function formatDateRange(
  start: Date | string | number,
  end: Date | string | number,
  style: DateStyle = 'short',
  options: FormatDateOptions = {},
): string {
  return `${formatDate(start, style, options)} – ${formatDate(end, style, options)}`;
}
