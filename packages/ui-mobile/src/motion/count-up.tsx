import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { duration, easingFn } from '@chefer/tokens';
import { cn } from '@chefer/utils';
import { useReducedMotion } from './use-reduced-motion';

// Count-up numbers for MO-06. A JS-thread rAF tween — the spec's one allowed
// per-frame exception (≤ 4 per screen). It only re-renders when the ROUNDED
// number changes, stops at the target, and under reduced motion returns the
// final value immediately. Committed values only: never feed it keystrokes.

const enterEase = easingFn('enter');

/**
 * Tween from the previous value (0 on first mount) to `target` over
 * `durationMs` (default `deliberate`, 600 ms) with the `enter` curve.
 */
export function useCountUp(target: number, durationMs: number = duration.deliberate): number {
  const reduced = useReducedMotion();
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(reduced ? safeTarget : 0);
  const current = useRef(reduced ? safeTarget : 0);

  useEffect(() => {
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
      setDisplay((prev) => (k < 1 && Math.round(prev) === Math.round(next) ? prev : next));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, reduced, durationMs]);

  return reduced ? safeTarget : display;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

export interface CountUpProps extends Omit<TextProps, 'children'> {
  value: number;
  /** Display formatter (default: rounded, locale-grouped — "2,810"). */
  format?: (value: number) => string;
  durationMs?: number;
  className?: string;
}

/**
 * A number that counts up to `value`. `tabular-nums` keeps the width steady
 * while it counts; screen readers get the final value, never the tween.
 */
export function CountUp({
  value,
  format = defaultFormat,
  durationMs,
  className,
  style,
  ...props
}: CountUpProps) {
  const shown = useCountUp(value, durationMs);
  return (
    <Text
      accessibilityLabel={format(value)}
      className={cn(className)}
      style={[{ fontVariant: ['tabular-nums'] }, style]}
      {...props}
    >
      {format(shown)}
    </Text>
  );
}
