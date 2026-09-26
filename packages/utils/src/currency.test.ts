import { describe, expect, it } from 'vitest';
import {
  currencySymbol,
  EUR_EXCHANGE_RATES,
  formatCurrencyAmount,
  formatMoney,
  fromEur,
  isConvertedCurrency,
  toDisplayCurrency,
  toEur,
} from './currency';

// Intl separates "RON" with a no-break space; normalise for readable asserts.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('currency conversion', () => {
  it('keeps EUR as the identity and uses the static table for the rest', () => {
    expect(EUR_EXCHANGE_RATES.EUR).toBe(1);
    expect(fromEur(10, 'EUR')).toBe(10);
    expect(fromEur(10, 'USD')).toBeCloseTo(10.8);
    expect(fromEur(10, 'GBP')).toBeCloseTo(8.5);
    expect(fromEur(10, 'RON')).toBeCloseTo(49.7);
  });

  it('converts back to EUR rounded to the cent', () => {
    expect(toEur(60, 'USD')).toBe(55.56);
    expect(toEur(60, 'EUR')).toBe(60);
    // A budget typed in USD survives the EUR round trip at whole-unit display.
    expect(Math.round(fromEur(toEur(60, 'USD'), 'USD'))).toBe(60);
  });

  it('flags converted currencies as approximate', () => {
    expect(isConvertedCurrency('EUR')).toBe(false);
    expect(isConvertedCurrency('USD')).toBe(true);
  });

  it('narrows stored values to a supported currency', () => {
    expect(toDisplayCurrency('usd')).toBe('USD');
    expect(toDisplayCurrency(null)).toBe('EUR');
    expect(toDisplayCurrency('JPY')).toBe('EUR');
  });
});

describe('formatMoney', () => {
  it('formats a EUR estimate in each currency with its own symbol', () => {
    expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
    expect(formatMoney(12.5, 'USD')).toBe('$13.50');
    expect(formatMoney(12.5, 'GBP')).toBe('£10.63');
    expect(plain(formatMoney(12.5, 'RON'))).toBe('62,13 RON');
  });

  it('supports whole amounts', () => {
    expect(formatMoney(60, 'EUR', { decimals: 0 })).toBe('€60');
    expect(formatCurrencyAmount(60, 'USD', { decimals: 0 })).toBe('$60');
  });

  it('exposes a bare symbol for input prefixes', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('RON')).toBe('RON');
  });
});
