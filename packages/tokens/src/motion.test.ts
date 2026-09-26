import { describe, expect, it } from 'vitest';
import { elevation } from './elevation';
import {
  cssEasing,
  cssSpring,
  duration,
  easing,
  exit,
  haptic,
  pressScale,
  spring,
  stagger,
  type SpringName,
} from './motion';
import { radius } from './radius';

/**
 * The generator behind `cssSpring`: integrate a mass-1 spring from 0 to 1 at
 * 1 ms steps (semi-implicit Euler) and sample 17 evenly spaced points. The
 * last sample is pinned to 1 in the CSS so the animation ends at rest.
 */
function sampleSpring(name: SpringName, ms: number, samples = 17): number[] {
  const { damping, stiffness, mass } = spring[name];
  let x = 0;
  let v = 0;
  const xs = [0];
  for (let t = 1; t <= ms; t++) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * 0.001;
    x += v * 0.001;
    xs.push(x);
  }
  return Array.from({ length: samples }, (_, i) => xs[Math.round((i * ms) / (samples - 1))] ?? 1);
}

const parseLinear = (fn: string): number[] =>
  fn
    .replace(/^linear\(|\)$/g, '')
    .split(',')
    .map((s) => Number(s.trim()));

describe('duration / exit', () => {
  it('exit() is ~70% of the enter, rounded to whole ms', () => {
    expect(exit(duration.slow)).toBe(224);
    expect(exit(duration.base)).toBe(154);
    expect(exit(duration.instant)).toBe(70);
    expect(exit(155)).toBe(109); // 108.5 rounds up
    expect(Number.isInteger(exit(333))).toBe(true);
  });

  it('keeps the UI-feedback durations inside the 320 ms budget', () => {
    expect(duration.instant).toBeLessThan(duration.fast);
    expect(duration.fast).toBeLessThan(duration.base);
    expect(duration.base).toBeLessThan(duration.slow);
    expect(duration.slow).toBeLessThanOrEqual(320);
    expect(duration.deliberate).toBeLessThanOrEqual(600);
    expect(duration.celebrate).toBeLessThanOrEqual(1000);
  });
});

describe('easing', () => {
  it.each(Object.entries(easing))('%s has four control points in [0, 1]', (_name, points) => {
    expect(points).toHaveLength(4);
    for (const p of points) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('renders CSS cubic-bezier()', () => {
    expect(cssEasing('standard')).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(cssEasing('exit')).toBe('cubic-bezier(0.3, 0, 0.8, 0.15)');
  });
});

describe('spring / cssSpring', () => {
  it.each(Object.keys(spring) as SpringName[])(
    'cssSpring.%s matches the integrated spring',
    (name) => {
      const css = parseLinear(cssSpring[name].fn);
      const sampled = sampleSpring(name, cssSpring[name].ms);
      expect(css).toHaveLength(17);
      expect(css[0]).toBe(0);
      expect(css[16]).toBe(1);
      for (let i = 1; i < 16; i++) {
        expect(Math.abs((css[i] ?? 0) - (sampled[i] ?? 0))).toBeLessThan(0.01);
      }
    },
  );

  it('orders overshoot snappy < bouncy and gentle barely overshoots', () => {
    const peak = (name: SpringName) => Math.max(...parseLinear(cssSpring[name].fn));
    expect(peak('gentle')).toBeLessThan(1.02);
    expect(peak('snappy')).toBeGreaterThan(1.04);
    expect(peak('bouncy')).toBeGreaterThan(1.2);
  });
});

describe('the rest of the vocabulary', () => {
  it('caps the stagger at 6 items / 200 ms total', () => {
    expect(stagger.step * stagger.maxItems).toBeLessThanOrEqual(200);
  });

  it('names expo-haptics calls for every haptic', () => {
    expect(Object.keys(haptic).sort()).toEqual(
      ['error', 'lift', 'selection', 'success', 'tick', 'warning'].sort(),
    );
  });

  it('presses controls deeper than cards', () => {
    expect(pressScale.control).toBeLessThan(pressScale.card);
    expect(pressScale.card).toBeLessThan(1);
  });

  it('has role radii in ascending order and two-layer warm shadows', () => {
    expect(radius.inner).toBeLessThan(radius.control);
    expect(radius.control).toBeLessThan(radius.card);
    expect(radius.card).toBeLessThan(radius.sheet);
    for (const level of ['e1', 'e2', 'e3', 'e4', 'e4Up'] as const) {
      expect(elevation[level].match(/rgba\(67,42,25,/g)).toHaveLength(2);
    }
  });
});
