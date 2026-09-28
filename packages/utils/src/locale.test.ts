import { describe, expect, it } from 'vitest';
import {
  cmToIn,
  defaultsForRegion,
  detectRegion,
  EUROZONE_REGIONS,
  inferUnitsFromInput,
  inToCm,
  regionFromLocale,
} from './locale';

describe('cmToIn / inToCm', () => {
  it('round-trips a typical height', () => {
    expect(cmToIn(175)).toBeCloseTo(68.9, 1);
    expect(inToCm(69)).toBeCloseTo(175.3, 1);
  });

  it('inToCm(cmToIn(x)) is stable within rounding', () => {
    expect(inToCm(cmToIn(180))).toBeCloseTo(180, 0);
  });
});

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

describe('inferUnitsFromInput (bug B-43, T-03.8)', () => {
  it('switches to metric on an en-US default when 170 cm / 65 kg is typed (AC11)', () => {
    expect(
      inferUnitsFromInput({ heightValue: 170, weightValue: 65, currentUnits: 'IMPERIAL' }),
    ).toEqual({ suggestedUnits: 'METRIC', shouldSwitch: true });
  });

  it('switches to imperial when a plausible ft/lb pair is typed on metric', () => {
    expect(
      inferUnitsFromInput({ heightValue: 68, weightValue: 160, currentUnits: 'METRIC' }),
    ).toEqual({ suggestedUnits: 'IMPERIAL', shouldSwitch: true });
  });

  it('does not switch when the typed values already fit the current system', () => {
    expect(
      inferUnitsFromInput({ heightValue: 175, weightValue: 70, currentUnits: 'METRIC' }),
    ).toEqual({ suggestedUnits: 'METRIC', shouldSwitch: false });
    expect(
      inferUnitsFromInput({ heightValue: 68, weightValue: 160, currentUnits: 'IMPERIAL' }),
    ).toEqual({ suggestedUnits: 'IMPERIAL', shouldSwitch: false });
  });

  it('does not switch with nothing typed yet', () => {
    expect(
      inferUnitsFromInput({ heightValue: null, weightValue: null, currentUnits: 'IMPERIAL' }),
    ).toEqual({ suggestedUnits: 'IMPERIAL', shouldSwitch: false });
  });

  it('never swaps to a system the value does not fit either (an unlikely typo)', () => {
    expect(
      inferUnitsFromInput({ heightValue: 5, weightValue: null, currentUnits: 'METRIC' }),
    ).toEqual({ suggestedUnits: 'METRIC', shouldSwitch: false });
  });

  it('decides on height alone when weight is absent', () => {
    expect(
      inferUnitsFromInput({ heightValue: 170, weightValue: null, currentUnits: 'IMPERIAL' }),
    ).toEqual({ suggestedUnits: 'METRIC', shouldSwitch: true });
  });
});
