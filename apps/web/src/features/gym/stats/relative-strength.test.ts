import { describe, expect, it } from 'vitest';
import type { BodyweightPointDto, E1rmPointDto } from '@chefer/types';
import { withBodyweight } from './relative-strength';

function e1rm(localDate: string, e1rmKg: number): E1rmPointDto {
  return {
    localDate,
    sessionId: `s-${localDate}`,
    e1rmKg,
    weightKg: e1rmKg,
    reps: 1,
    lowConfidence: false,
    isPr: false,
  };
}

function bw(localDate: string, weightKg: number): BodyweightPointDto {
  return { localDate, weightKg };
}

describe('withBodyweight', () => {
  it('carries the latest known bodyweight forward to later e1RM points', () => {
    const points = [e1rm('2026-01-01', 80), e1rm('2026-01-10', 85), e1rm('2026-01-20', 90)];
    const weights = [bw('2026-01-01', 80), bw('2026-01-15', 78)];
    const result = withBodyweight(points, weights);
    expect(result.map((p) => p.bodyweightKg)).toEqual([80, 80, 78]);
  });

  it('is null before any bodyweight has been logged', () => {
    const points = [e1rm('2026-01-01', 80)];
    const weights = [bw('2026-02-01', 80)];
    const result = withBodyweight(points, weights);
    expect(result[0]?.bodyweightKg).toBeNull();
    expect(result[0]?.relative).toBeNull();
  });

  it('computes the relative-strength ratio, rounded to 2 decimals', () => {
    const points = [e1rm('2026-01-01', 100)];
    const weights = [bw('2026-01-01', 80)];
    const result = withBodyweight(points, weights);
    expect(result[0]?.relative).toBe(1.25);
  });

  it('is unaffected by the order bodyweight entries are passed in', () => {
    const points = [e1rm('2026-01-20', 90)];
    const weights = [bw('2026-01-15', 78), bw('2026-01-01', 80)];
    const result = withBodyweight(points, weights);
    expect(result[0]?.bodyweightKg).toBe(78);
  });
});
