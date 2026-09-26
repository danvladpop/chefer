import { describe, expect, it } from 'vitest';
import { regionCodeSchema, setDisplayPreferencesInputSchema } from './preferences';

describe('display preference schemas', () => {
  it('accepts a unit, a currency, or both — but not nothing', () => {
    expect(setDisplayPreferencesInputSchema.safeParse({ preferredUnits: 'IMPERIAL' }).success).toBe(
      true,
    );
    expect(setDisplayPreferencesInputSchema.safeParse({ currency: 'RON' }).success).toBe(true);
    expect(setDisplayPreferencesInputSchema.safeParse({}).success).toBe(false);
    expect(setDisplayPreferencesInputSchema.safeParse({ currency: 'JPY' }).success).toBe(false);
  });

  it('normalises two-letter regions and rejects anything else', () => {
    expect(regionCodeSchema.parse('us')).toBe('US');
    expect(regionCodeSchema.safeParse('USA').success).toBe(false);
    expect(regionCodeSchema.safeParse('1A').success).toBe(false);
  });
});
