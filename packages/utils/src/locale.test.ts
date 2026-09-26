import { describe, expect, it } from 'vitest';
import { defaultsForRegion, detectRegion, EUROZONE_REGIONS, regionFromLocale } from './locale';

describe('defaultsForRegion', () => {
  it('puts the US, Liberia and Myanmar on imperial, everyone else on metric', () => {
    expect(defaultsForRegion('US').preferredUnits).toBe('IMPERIAL');
    expect(defaultsForRegion('LR').preferredUnits).toBe('IMPERIAL');
    expect(defaultsForRegion('mm').preferredUnits).toBe('IMPERIAL');
    for (const r of ['GB', 'RO', 'DE', 'CA', 'AU', 'IN']) {
      expect(defaultsForRegion(r).preferredUnits).toBe('METRIC');
    }
  });

  it('maps currency: US→USD, GB→GBP, RO→RON, eurozone and the rest→EUR', () => {
    expect(defaultsForRegion('US').currency).toBe('USD');
    expect(defaultsForRegion('gb').currency).toBe('GBP');
    expect(defaultsForRegion('RO').currency).toBe('RON');
    for (const r of EUROZONE_REGIONS) expect(defaultsForRegion(r).currency).toBe('EUR');
    expect(defaultsForRegion('JP').currency).toBe('EUR');
    expect(defaultsForRegion('LR').currency).toBe('EUR');
  });

  it('falls back to METRIC + EUR without a region', () => {
    const fallback = { preferredUnits: 'METRIC', currency: 'EUR' };
    expect(defaultsForRegion(null)).toEqual(fallback);
    expect(defaultsForRegion(undefined)).toEqual(fallback);
    expect(defaultsForRegion('')).toEqual(fallback);
  });
});

describe('regionFromLocale', () => {
  it('reads the explicit region subtag', () => {
    expect(regionFromLocale('en-GB')).toBe('GB');
    expect(regionFromLocale('ro_RO')).toBe('RO');
    expect(regionFromLocale('zh-Hant-TW')).toBe('TW');
    expect(regionFromLocale('en-us')).toBe('US');
  });

  it('maximises a bare language tag', () => {
    expect(regionFromLocale('en')).toBe('US');
    expect(regionFromLocale('ro')).toBe('RO');
  });

  it('returns null for nothing usable', () => {
    expect(regionFromLocale('')).toBeNull();
    expect(regionFromLocale(undefined)).toBeNull();
    expect(regionFromLocale('!!')).toBeNull();
  });
});

describe('detectRegion', () => {
  it('prefers the passed platform locales', () => {
    expect(detectRegion(['en-GB', 'en-US'])).toBe('GB');
    expect(detectRegion([undefined, 'ro-RO'])).toBe('RO');
  });

  it('falls back to the Intl default locale', () => {
    const region = detectRegion();
    expect(region === null || /^[A-Z]{2}$/.test(region)).toBe(true);
  });
});
