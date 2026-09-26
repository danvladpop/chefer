'use client';

import * as React from 'react';
import { duration, easingFn } from '@chefer/tokens';
import { useReducedMotion } from './use-reduced-motion';

// JS-thread tweens for MO-06 — the spec's allowed per-frame exceptions (the
// count-up text and the SVG ring, ≤ 4 per screen). A rAF loop from the
// previous value (0 on first mount) to the target over `deliberate` 600 ms
// with the `enter` curve; a new target retargets from wherever it is now.
// Under reduced motion the final value shows immediately. Mirrors
// @chefer/ui-mobile's useCountUp. Committed values only — never keystrokes.

const enterEase = easingFn('enter');

/**
 * Tween towards `target`. `quantum` > 0 skips re-renders until the value
 * moves by a whole step (a count-up only needs to repaint when the ROUNDED
 * number changes); 0 re-renders every frame (a ring's arc).
 */
export function useTween(
  target: number,
  durationMs: number = duration.deliberate,
  quantum = 0,
): number {
  const reduced = useReducedMotion();
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = React.useState(reduced ? safeTarget : 0);
  const current = React.useRef(reduced ? safeTarget : 0);

  React.useEffect(() => {
    const from = current.current;
    if (reduced || from === safeTarget || durationMs <= 0) {
      current.current = safeTarget;
      setDisplay(safeTarget);
      return;
    }
    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      startedAt ??= now;
      const k = Math.min(1, (now - startedAt) / durationMs);
      const next = k >= 1 ? safeTarget : from + (safeTarget - from) * enterEase(k);
      current.current = next;
      setDisplay((prev) =>
        k < 1 && quantum > 0 && Math.round(prev / quantum) === Math.round(next / quantum)
          ? prev
          : next,
      );
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, reduced, durationMs, quantum]);

  return reduced ? safeTarget : display;
}

/** A number that counts up to `target` (repaints once per whole unit). */
export function useCountUp(target: number, durationMs: number = duration.deliberate): number {
  return useTween(target, durationMs, 1);
}
