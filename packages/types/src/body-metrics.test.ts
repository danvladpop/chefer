import { describe, expect, it } from 'vitest';
import {
  ADULT_AGE,
  bodyMetricsAgeError,
  bodyMetricsAgeSchema,
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
