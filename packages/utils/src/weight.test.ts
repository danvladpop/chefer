import { describe, expect, it } from 'vitest';
import { parseBodyWeightKg, weightChangeTone } from './weight';

describe('parseBodyWeightKg', () => {
  it('accepts dot and comma decimals, rounding to 0.1 kg', () => {
    expect(parseBodyWeightKg('72.5')).toEqual({ ok: true, kg: 72.5 });
    expect(parseBodyWeightKg(' 72,46 ')).toEqual({ ok: true, kg: 72.5 });
    expect(parseBodyWeightKg('80')).toEqual({ ok: true, kg: 80 });
  });

  it('rejects the audit typos: out of range, negative, exponent', () => {
    for (const bad of ['1000', '0.001', '8', '-5', '1,5e3', '1e2', '72kg', '']) {
      expect(parseBodyWeightKg(bad).ok).toBe(false);
    }
  });

  it('keeps the bounds inclusive', () => {
    expect(parseBodyWeightKg('20').ok).toBe(true);
    expect(parseBodyWeightKg('400').ok).toBe(true);
    expect(parseBodyWeightKg('400.1').ok).toBe(false);
  });
});

describe('weightChangeTone', () => {
  it('reads a gain as good news only when the goal is to gain', () => {
    expect(weightChangeTone(1.2, 'GAIN_MUSCLE')).toBe('positive');
    expect(weightChangeTone(-1.2, 'GAIN_MUSCLE')).toBe('negative');
  });

  it('reads a loss as good news when the goal is to lose', () => {
    expect(weightChangeTone(-0.8, 'LOSE_WEIGHT')).toBe('positive');
    expect(weightChangeTone(0.8, 'LOSE_WEIGHT')).toBe('negative');
  });

  it('stays neutral for goals without a direction and for tiny changes', () => {
    expect(weightChangeTone(2, 'MAINTAIN')).toBe('neutral');
    expect(weightChangeTone(-2, 'EAT_HEALTHIER')).toBe('neutral');
    expect(weightChangeTone(-2, null)).toBe('neutral');
    expect(weightChangeTone(0.04, 'GAIN_MUSCLE')).toBe('neutral');
  });
});
