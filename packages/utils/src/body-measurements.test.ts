import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import type { BodyMeasurementDto } from '@chefer/types';
import {
  formatMeasure,
  measureChangeText,
  measuredMeasures,
  measureSeries,
  parseMeasure,
  parseMeasurementForm,
} from './body-measurements';

const entry = (measuredOn: string, over: Partial<BodyMeasurementDto> = {}): BodyMeasurementDto => ({
  id: measuredOn,
  measuredOn,
  waistCm: null,
  hipsCm: null,
  chestCm: null,
  upperArmCm: null,
  thighCm: null,
  bodyFatPct: null,
  ...over,
});

describe('formatMeasure', () => {
  it('shows lengths in the user’s unit and body fat as a percentage', () => {
    expect(formatMeasure('waist', 82.5, 'METRIC')).toBe('82.5 cm');
    expect(formatMeasure('waist', 82.5, 'IMPERIAL')).toBe('32.5 in');
    expect(formatMeasure('bodyFat', 21.4, 'IMPERIAL')).toBe('21.4 %');
  });

  it('signs a change with a real minus sign', () => {
    expect(formatMeasure('waist', -2, 'METRIC', { signed: true })).toBe('−2.0 cm');
    expect(formatMeasure('thigh', 1.27, 'IMPERIAL', { signed: true })).toBe('+0.5 in');
  });
});

describe('parseMeasure', () => {
  it('treats an empty field as "not measured"', () => {
    expect(parseMeasure('waist', '  ', 'METRIC')).toEqual({ ok: true, value: undefined });
  });

  it('accepts a comma decimal and returns cm', () => {
    expect(parseMeasure('waist', '82,5', 'METRIC')).toEqual({ ok: true, value: 82.5 });
    expect(parseMeasure('waist', '32.5', 'IMPERIAL')).toEqual({ ok: true, value: 82.6 });
  });

  it('rejects junk and implausible values with a message in the user’s unit', () => {
    expect(parseMeasure('waist', '1e3', 'METRIC')).toEqual({
      ok: false,
      error: 'Use a number like 82.5.',
    });
    expect(parseMeasure('waist', '400', 'METRIC')).toEqual({
      ok: false,
      error: 'Must be between 10 and 250 cm.',
    });
    expect(parseMeasure('waist', '120', 'IMPERIAL')).toEqual({
      ok: false,
      error: 'Must be between 4 and 98 in.',
    });
    expect(parseMeasure('bodyFat', '90', 'METRIC')).toEqual({
      ok: false,
      error: 'Body fat must be between 2 and 70 %.',
    });
  });
});

describe('parseMeasurementForm', () => {
  it('collects the filled measures as API values', () => {
    expect(parseMeasurementForm({ waist: '82', bodyFat: '21.5', hips: '' }, 'METRIC')).toEqual({
      ok: true,
      values: { waistCm: 82, bodyFatPct: 21.5 },
    });
  });

  it('needs at least one measure', () => {
    expect(parseMeasurementForm({}, 'METRIC')).toEqual({
      ok: false,
      errors: {},
      formError: 'Enter at least one measurement.',
    });
  });

  it('reports every invalid field', () => {
    const result = parseMeasurementForm({ waist: 'abc', chest: '999' }, 'METRIC');
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors)).toEqual(['waist', 'chest']);
  });
});

describe('measureSeries / measuredMeasures / measureChangeText', () => {
  const entries = [
    entry('2026-10-20', { waistCm: 80, bodyFatPct: 20 }),
    entry('2026-09-01', { waistCm: 82 }),
    entry('2026-10-01', { hipsCm: 100 }),
  ];

  it('lists one measure oldest first, skipping days it wasn’t measured', () => {
    expect(measureSeries(entries, 'waist')).toEqual([
      { measuredOn: '2026-09-01', value: 82 },
      { measuredOn: '2026-10-20', value: 80 },
    ]);
  });

  it('knows which measures have data', () => {
    expect(measuredMeasures(entries)).toEqual(['waist', 'hips', 'bodyFat']);
  });

  it('describes the change neutrally', () => {
    const waist = measureSeries(entries, 'waist');
    expect(measureChangeText(waist, 'waist', 'METRIC')).toBe('−2.0 cm since your first entry');
    expect(measureChangeText(waist, 'waist', 'IMPERIAL')).toBe('−0.8 in since your first entry');
    expect(measureChangeText(measureSeries(entries, 'hips'), 'hips', 'METRIC')).toBeNull();
    expect(
      measureChangeText(
        [
          { measuredOn: 'a', value: 80 },
          { measuredOn: 'b', value: 80.02 },
        ],
        'waist',
        'METRIC',
      ),
    ).toBe('No change since your first entry');
    expect(containsForbiddenPhrase(measureChangeText(waist, 'waist', 'METRIC') ?? '')).toBeNull();
  });
});
