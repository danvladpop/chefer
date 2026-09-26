import { easing, type EasingName } from './motion';

// A plain-JS cubic-bézier easing (CSS semantics), for the few JS-thread
// animations that cannot run on the compositor / UI thread — the count-up
// text in MO-06 on both apps. Newton–Raphson with a bisection fallback,
// accurate to ~1e-6. Zero dependencies, like the rest of this package.

export type EasingFn = (t: number) => number;

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  // Polynomial coefficients for x(s) and y(s), s ∈ [0, 1].
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solveS = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (lo < hi) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-6) return s;
      if (x > v) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveS(t));
  };
}

/** A named token curve as a JS easing function. */
export const easingFn = (k: EasingName): EasingFn => {
  const [x1, y1, x2, y2] = easing[k];
  return cubicBezier(x1, y1, x2, y2);
};
