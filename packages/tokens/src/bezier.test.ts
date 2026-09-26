import { describe, expect, it } from 'vitest';
import { cubicBezier, easingFn } from './bezier';

describe('cubicBezier', () => {
  it('is the identity for the linear curve', () => {
    const f = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      expect(f(t)).toBeCloseTo(t, 5);
    }
  });

  it('matches CSS ease (0.25, 0.1, 0.25, 1) at the midpoint', () => {
    // Reference value from the WebKit UnitBezier implementation.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('clamps outside [0, 1] and is monotonic for the token curves', () => {
    for (const name of ['standard', 'enter', 'exit', 'linear'] as const) {
      const f = easingFn(name);
      expect(f(-1)).toBe(0);
      expect(f(2)).toBe(1);
      let prev = 0;
      for (let i = 1; i <= 100; i++) {
        const v = f(i / 100);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('decelerates on enter and accelerates on exit', () => {
    expect(easingFn('enter')(0.25)).toBeGreaterThan(0.5);
    expect(easingFn('exit')(0.5)).toBeLessThan(0.5);
  });
});
