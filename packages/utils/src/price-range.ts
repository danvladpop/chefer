import type { DisplayCurrency } from '@chefer/types';
import { formatMoney } from './currency';

// ─── Price ranges (§2.5, T-08.2) ───────────────────────────────────────────────
// The server keeps EUR point estimates; the client shows a range around them
// instead of a false-precision single number. One band, tuned in one place
// (V5), applied on the way to display in the user's currency.

/** ± share of the point estimate shown as the range (V5 tunes this). */
export const PRICE_RANGE_BAND = 0.15;

export interface PriceRange {
  lowEur: number;
  highEur: number;
}

/** The ± band around a EUR point estimate. Null in, null out (unknown price). */
export function priceRange(pointEur: number | null | undefined): PriceRange | null {
  if (pointEur == null || !(pointEur >= 0)) return null;
  const delta = pointEur * PRICE_RANGE_BAND;
  return { lowEur: Math.max(0, pointEur - delta), highEur: pointEur + delta };
}

/** "€18–24"-style range, in the user's display currency. Null in, null out. */
export function formatPriceRange(
  pointEur: number | null | undefined,
  currency: DisplayCurrency,
): string | null {
  const range = priceRange(pointEur);
  if (!range) return null;
  const low = formatMoney(range.lowEur, currency, { decimals: 0 });
  const high = formatMoney(range.highEur, currency, { decimals: 0 });
  return `${low}–${high}`;
}
