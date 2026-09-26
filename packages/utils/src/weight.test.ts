import { describe, expect, it } from 'vitest';
import {
  BODY_WEIGHT_KG_MAX,
  BODY_WEIGHT_KG_MIN,
  BODY_WEIGHT_LB_MAX,
  BODY_WEIGHT_LB_MIN,
  bodyWeightInUnit,
  bodyWeightUnit,
  formatBodyWeight,
  formatWeightTrend,
  parseBodyWeight,
  parseBodyWeightKg,
  weightChangeTone,
} from './weight';

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

describe('body weight in the user unit', () => {
  it('formats kg for METRIC and pounds (0.1) for IMPERIAL', () => {
    expect(formatBodyWeight(72.5, 'METRIC')).toBe('72.5 kg');
    expect(formatBodyWeight(72.5, 'IMPERIAL')).toBe('159.8 lb');
    expect(bodyWeightUnit('IMPERIAL')).toBe('lb');
    expect(bodyWeightInUnit(100, 'IMPERIAL')).toBe(220.5);
  });

  it('formats signed deltas with one decimal', () => {
    expect(formatBodyWeight(1.2, 'METRIC', { signed: true })).toBe('+1.2 kg');
    expect(formatBodyWeight(-1, 'METRIC', { signed: true })).toBe('-1.0 kg');
    expect(formatBodyWeight(-0.5, 'IMPERIAL', { signed: true })).toBe('-1.1 lb');
  });

  it('parses METRIC exactly like parseBodyWeightKg', () => {
    for (const input of ['72.5', '72,46', '1000', '', 'abc', '20']) {
      expect(parseBodyWeight(input, 'METRIC')).toEqual(parseBodyWeightKg(input));
    }
  });

  it('parses pounds into kg rounded to 0.1', () => {
    expect(parseBodyWeight('160', 'IMPERIAL')).toEqual({ ok: true, kg: 72.6 });
    expect(parseBodyWeight(' 159,8 ', 'IMPERIAL')).toEqual({ ok: true, kg: 72.5 });
  });

  it('keeps the lb bounds inside the API kg bounds, with lb copy', () => {
    const min = parseBodyWeight(String(BODY_WEIGHT_LB_MIN), 'IMPERIAL');
    const max = parseBodyWeight(String(BODY_WEIGHT_LB_MAX), 'IMPERIAL');
    expect(min.ok && min.kg >= BODY_WEIGHT_KG_MIN).toBe(true);
    expect(max.ok && max.kg <= BODY_WEIGHT_KG_MAX).toBe(true);
    const low = parseBodyWeight('43.9', 'IMPERIAL');
    expect(low).toEqual({ ok: false, error: 'Weight must be between 44 and 881 lb.' });
    expect(parseBodyWeight('882', 'IMPERIAL').ok).toBe(false);
    expect(parseBodyWeight('1e2', 'IMPERIAL').ok).toBe(false);
    expect(parseBodyWeight('', 'IMPERIAL')).toEqual({ ok: false, error: 'Enter your weight.' });
  });

  it('round-trips a displayed pound value back to the same kg', () => {
    for (const kg of [20, 55.3, 72.5, 99.9, 150.1, 399.6]) {
      const shown = String(bodyWeightInUnit(kg, 'IMPERIAL'));
      expect(parseBodyWeight(shown, 'IMPERIAL')).toEqual({ ok: true, kg });
    }
  });
});

describe('formatWeightTrend', () => {
  it('formats the weekly trend in the user unit', () => {
    expect(formatWeightTrend(-0.4, 'METRIC')).toBe('−0.4 kg/wk');
    expect(formatWeightTrend(0.4, 'IMPERIAL')).toBe('+0.9 lb/wk');
    expect(formatWeightTrend(0.01, 'IMPERIAL')).toBe('steady');
    expect(formatWeightTrend(null, 'METRIC')).toBeNull();
  });
});
