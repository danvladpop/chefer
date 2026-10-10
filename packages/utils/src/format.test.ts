import { describe, expect, it } from 'vitest';
import {
  deviceLocale,
  formatApproxPrice,
  formatApproxPriceHint,
  formatDate,
  formatDateRange,
  formatKcal,
  formatNumber,
  formatQty,
} from './format';
import { formatPriceRange } from './price-range';

// 3 Oct 2026, noon UTC — a Saturday in every time zone.
const DAY = new Date(Date.UTC(2026, 9, 3, 12));

describe('formatDate follows the locale it is given (UX-X-15)', () => {
  it('orders day and month the way the locale does', () => {
    expect(formatDate(DAY, 'short', { locale: 'en-GB' })).toBe('3 Oct');
    expect(formatDate(DAY, 'short', { locale: 'en-US' })).toBe('Oct 3');
    expect(formatDate(DAY, 'medium', { locale: 'en-GB' })).toBe('3 Oct 2026');
  });

  it('localises month and weekday names', () => {
    expect(formatDate(DAY, 'long', { locale: 'de-DE' })).toBe('3. Oktober');
    expect(formatDate(DAY, 'weekday-long', { locale: 'fr-FR' })).toBe('samedi');
  });

  it('formats a calendar day stored as UTC midnight in UTC', () => {
    const midnight = new Date(Date.UTC(2026, 9, 3));
    expect(formatDate(midnight, 'weekday', { locale: 'en-GB', timeZone: 'UTC' })).toBe('Sat');
  });

  it('is empty for an invalid date instead of "Invalid Date"', () => {
    expect(formatDate('nope', 'short', { locale: 'en-GB' })).toBe('');
  });

  it('formats a range', () => {
    const end = new Date(Date.UTC(2026, 9, 9, 12));
    expect(formatDateRange(DAY, end, 'short', { locale: 'en-GB' })).toBe('3 Oct – 9 Oct');
  });
});

describe('numbers', () => {
  it('groups by locale', () => {
    expect(formatKcal(1800, 'en-US')).toBe('1,800');
    expect(formatKcal(1800, 'de-DE')).toBe('1.800');
    expect(formatNumber(2.46, { locale: 'de-DE', maximumFractionDigits: 1 })).toBe('2,5');
  });

  it('rounds kcal to whole numbers', () => {
    expect(formatKcal(1799.6, 'en-US')).toBe('1,800');
  });

  it('device locale is a usable tag', () => {
    expect(() => new Intl.NumberFormat(deviceLocale())).not.toThrow();
    expect(formatKcal(1234)).toMatch(/1\D?234/);
  });
});

describe('formatQty', () => {
  it('converts to the unit system', () => {
    expect(formatQty(454, 'g', 'IMPERIAL', 'en-US')).toBe('1 lb');
    expect(formatQty(1000, 'g', 'METRIC', 'en-US')).toBe('1 kg');
  });

  it('uses the locale decimal separator', () => {
    expect(formatQty(1.5, 'kg', 'METRIC', 'de-DE')).toBe('1,5 kg');
    expect(formatQty(1.5, 'kg', 'METRIC', 'en-GB')).toBe('1.5 kg');
  });

  it('prints a bare count without a stray space', () => {
    expect(formatQty(3, undefined, 'METRIC', 'en-US')).toBe('3');
    expect(formatQty(3, 'pcs', 'METRIC', 'en-US')).toBe('3 pieces');
  });
});

describe('prices', () => {
  it('rounds an estimate to whole currency units, never to the cent', () => {
    expect(formatApproxPrice(6.56, 'EUR', 'en-IE')).toBe('€7');
    expect(formatApproxPrice(12.7, 'EUR', 'en-IE')).toBe('€13');
  });

  it('marks an approximate price once: ~€7, or <€1 on its own', () => {
    expect(formatApproxPriceHint(6.56, 'EUR', 'en-IE')).toBe('~€7');
    expect(formatApproxPriceHint(0.3, 'EUR', 'en-IE')).toBe('<€1');
  });

  it('says "under one" instead of rounding a 40-cent herb up', () => {
    expect(formatApproxPrice(0.4, 'EUR', 'en-IE')).toBe('<€1');
  });

  it('formats a range in the device locale when given one', () => {
    expect(formatPriceRange(20, 'EUR', 'en-IE')).toBe('€17–€23');
    expect(formatPriceRange(20, 'EUR')).toBe('€17–€23');
    expect(formatPriceRange(null, 'EUR')).toBeNull();
  });
});
