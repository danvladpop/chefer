import type { DisplayCurrency } from '@chefer/types';

// ─── Price display in the user's currency (backlog P2-6) ──────────────────────
// Every price Chefer shows is an ESTIMATE in EUR (the ingredient price
// vocabulary), and the API keeps returning EUR. Clients convert for display
// with this one static table — approximate by design, so it never needs a
// live FX feed. Update the rates HERE and nowhere else.

/** Approximate units of each currency per 1 EUR. */
export const EUR_EXCHANGE_RATES: Readonly<Record<DisplayCurrency, number>> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  RON: 4.97,
};

/** When the table above was last reviewed (shown nowhere; for maintainers). */
export const EUR_EXCHANGE_RATES_AS_OF = '2026-09';

/** Formatting locale per currency, so each reads the way its users expect. */
const CURRENCY_LOCALE: Readonly<Record<DisplayCurrency, string>> = {
  EUR: 'en-IE', // €12.50
  USD: 'en-US', // $12.50
  GBP: 'en-GB', // £12.50
  RON: 'ro-RO', // 12,50 RON
};

const FALLBACK_SYMBOL: Readonly<Record<DisplayCurrency, { symbol: string; suffix: boolean }>> = {
  EUR: { symbol: '€', suffix: false },
  USD: { symbol: '$', suffix: false },
  GBP: { symbol: '£', suffix: false },
  RON: { symbol: ' RON', suffix: true },
};

/** Narrows an arbitrary stored value ("usd", null, "JPY") to a supported currency. */
export function toDisplayCurrency(value: string | null | undefined): DisplayCurrency {
  const upper = (value ?? '').toUpperCase();
  return upper in EUR_EXCHANGE_RATES ? (upper as DisplayCurrency) : 'EUR';
}

/** True when a price shown in `currency` went through the approximate table. */
export function isConvertedCurrency(currency: DisplayCurrency): boolean {
  return currency !== 'EUR';
}

/** EUR → `currency`, unrounded. */
export function fromEur(amountEur: number, currency: DisplayCurrency): number {
  return amountEur * EUR_EXCHANGE_RATES[currency];
}

/** `currency` → EUR, rounded to the cent (e.g. a budget typed in USD). */
export function toEur(amount: number, currency: DisplayCurrency): number {
  return Math.round((amount / EUR_EXCHANGE_RATES[currency]) * 100) / 100;
}

export type FormatMoneyOptions = {
  /** Fraction digits; 2 by default, 0 for whole amounts like budgets. */
  decimals?: number;
};

/** Formats an amount ALREADY in `currency` (no conversion). */
export function formatCurrencyAmount(
  amount: number,
  currency: DisplayCurrency,
  options: FormatMoneyOptions = {},
): string {
  const decimals = options.decimals ?? 2;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Runtimes without Intl currency support still get a readable price.
    const { symbol, suffix } = FALLBACK_SYMBOL[currency];
    const n = amount.toFixed(decimals);
    return suffix ? `${n}${symbol}` : `${symbol}${n}`;
  }
}

/**
 * Formats a EUR estimate in the user's currency: formatMoney(12.5, 'USD')
 * → "$13.50". Callers keep their own "~" / "≈" prefix — the figure is an
 * estimate either way.
 */
export function formatMoney(
  amountEur: number,
  currency: DisplayCurrency,
  options: FormatMoneyOptions = {},
): string {
  return formatCurrencyAmount(fromEur(amountEur, currency), currency, options);
}

/** The symbol alone ("€", "$", "£", "RON"), e.g. for an input prefix. */
export function currencySymbol(currency: DisplayCurrency): string {
  return FALLBACK_SYMBOL[currency].symbol.trim();
}
