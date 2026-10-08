import { describe, expect, it } from 'vitest';
import {
  ADULT_AGE,
  bodyMetricsAgeError,
  bodyMetricsAgeSchema,
  bodyMetricsHeightError,
  bodyMetricsWeightError,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  isValidBodyMetricsAge,
  MIN_AGE_MESSAGE,
  MIN_BODY_METRICS_AGE,
} from './body-metrics';

describe('bodyMetricsAgeSchema', () => {
  it('rejects under-16 ages with the friendly message', () => {
    for (const age of [0, 10, 13, 15]) {
      const r = bodyMetricsAgeSchema.safeParse(age);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe(MIN_AGE_MESSAGE);
    }
  });

  it('accepts 16 through 110', () => {
    for (const age of [16, 17, 18, 40, 110]) {
      expect(bodyMetricsAgeSchema.safeParse(age).success).toBe(true);
    }
  });

  it('rejects non-integers and ages above 110', () => {
    expect(bodyMetricsAgeSchema.safeParse(30.5).success).toBe(false);
    expect(bodyMetricsAgeSchema.safeParse(111).success).toBe(false);
  });

  it('keeps the constants consistent', () => {
    expect(MIN_BODY_METRICS_AGE).toBe(16);
    expect(ADULT_AGE).toBe(18);
    expect(MIN_AGE_MESSAGE).toBe('Chefer is for people aged 16 and over.');
  });
});

describe('isValidBodyMetricsAge', () => {
  it('mirrors the schema', () => {
    expect(isValidBodyMetricsAge(15)).toBe(false);
    expect(isValidBodyMetricsAge(16)).toBe(true);
    expect(isValidBodyMetricsAge(110)).toBe(true);
    expect(isValidBodyMetricsAge(111)).toBe(false);
    expect(isValidBodyMetricsAge(16.5)).toBe(false);
  });
});

describe('bodyMetricsAgeError', () => {
  it('is null for an empty or valid age', () => {
    expect(bodyMetricsAgeError(null)).toBeNull();
    expect(bodyMetricsAgeError(undefined)).toBeNull();
    expect(bodyMetricsAgeError(16)).toBeNull();
    expect(bodyMetricsAgeError(110)).toBeNull();
  });

  it('returns the friendly message under 16', () => {
    expect(bodyMetricsAgeError(13)).toBe(MIN_AGE_MESSAGE);
    expect(bodyMetricsAgeError(0)).toBe(MIN_AGE_MESSAGE);
  });

  it('flags an age above the maximum', () => {
    expect(bodyMetricsAgeError(150)).toBe('Enter an age of 110 or under.');
  });
});

// UX-ONB-05: plausibility bounds shared by every height/weight form.
describe('height and weight plausibility bounds', () => {
  it('accepts 100-250 cm and 20-400 kg, bounds included', () => {
    for (const cm of [100, 177.8, 250]) expect(isPlausibleHeightCm(cm)).toBe(true);
    for (const kg of [20, 75, 400]) expect(isPlausibleWeightKg(kg)).toBe(true);
  });

  it('rejects the "1,80" typo and an 8 kg weight', () => {
    expect(isPlausibleHeightCm(1.8)).toBe(false);
    expect(isPlausibleHeightCm(251)).toBe(false);
    expect(isPlausibleWeightKg(8)).toBe(false);
    expect(isPlausibleWeightKg(401)).toBe(false);
    expect(isPlausibleHeightCm(Number.NaN)).toBe(false);
  });

  it('gives no message for empty or plausible values', () => {
    expect(bodyMetricsHeightError(null)).toBeNull();
    expect(bodyMetricsHeightError(undefined)).toBeNull();
    expect(bodyMetricsHeightError(175)).toBeNull();
    expect(bodyMetricsWeightError(null)).toBeNull();
    expect(bodyMetricsWeightError(75)).toBeNull();
  });

  it('words the message in the unit being typed', () => {
    expect(bodyMetricsHeightError(1.8)).toBe('Enter a height between 100 and 250 cm.');
    expect(bodyMetricsHeightError(1.8, 'IMPERIAL')).toBe(
      'Enter a height between 3 ft 4 in and 8 ft 2 in.',
    );
    expect(bodyMetricsWeightError(8)).toBe('Enter a weight between 20 and 400 kg.');
    expect(bodyMetricsWeightError(8, 'IMPERIAL')).toBe('Enter a weight between 45 and 881 lb.');
  });
});
