import { describe, expect, it } from 'vitest';
import { bodyweightOn, formatRelativeStrength, relativeStrength } from './relative-strength';

const weights = [
  { localDate: '2026-01-15', weightKg: 78 },
  { localDate: '2026-01-01', weightKg: 80 },
];

describe('bodyweightOn (UX-GYM-17)', () => {
  it('carries the latest weigh-in on or before the day forward', () => {
    expect(bodyweightOn(weights, '2026-01-10')).toBe(80);
    expect(bodyweightOn(weights, '2026-01-15')).toBe(78);
    expect(bodyweightOn(weights, '2026-02-01')).toBe(78);
  });

  it('is null for a lift older than every weigh-in unless a profile weight exists', () => {
    expect(bodyweightOn(weights, '2025-12-01')).toBeNull();
    expect(bodyweightOn(weights, '2025-12-01', 79)).toBe(79);
  });

  it('falls back to the profile weight when nothing was ever logged', () => {
    expect(bodyweightOn([], '2026-01-10', 82.5)).toBe(82.5);
  });

  it('prefers a real weigh-in over the profile weight', () => {
    expect(bodyweightOn(weights, '2026-01-10', 90)).toBe(80);
  });

  it('is null when no weight is known at all', () => {
    expect(bodyweightOn([], '2026-01-10')).toBeNull();
    expect(bodyweightOn([], '2026-01-10', 0)).toBeNull();
  });
});

describe('relativeStrength', () => {
  it('divides e1RM by body weight', () => {
    expect(relativeStrength(120, 80)).toBe(1.5);
    expect(relativeStrength(100, 75)).toBe(1.33);
  });

  it('never returns the raw kg when body weight is unknown', () => {
    expect(relativeStrength(120, null)).toBeNull();
    expect(relativeStrength(120, 0)).toBeNull();
  });

  it('prints as a multiple', () => {
    expect(formatRelativeStrength(1.5)).toBe('1.50×');
  });
});
