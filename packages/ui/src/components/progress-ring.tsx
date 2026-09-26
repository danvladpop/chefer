'use client';

import * as React from 'react';
import { duration } from '@chefer/tokens';
import { cn } from '../lib/utils';
import {
  dashOffset,
  isOverTarget,
  mainFill,
  normaliseProgress,
  overflowFill,
  progressColor,
} from '../motion/progress';
import { useTween } from '../motion/use-count-up';

// ─── ProgressRing ─────────────────────────────────────────────────────────────
// Circular progress (MO-06) — the web twin of @chefer/ui-mobile ProgressRing.
// Starts at 12 o'clock, runs clockwise and animates from its previous value
// (0 on first mount) over `deliberate` 600 ms with the `enter` curve. Past
// 100% with an `overColor`, the arc switches colour and the excess is drawn
// as a second, darker lap (up to 200%) — so 2,810 of 2,728 kcal no longer
// reads as a plain full circle. Reduced motion: the final value, immediately.

/** Below this the round cap would still paint a dot at 12 o'clock — hide it. */
const VISIBLE_EPSILON = 0.002;

export interface ProgressRingProps {
  /** 0..1 of the target. Above 1 the ring is full (and laps with `overColor`). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /**
   * Over-target colour, e.g. `overTargetColor` from @chefer/tokens for
   * calories. Omit where "more than planned" is not a warning.
   */
  overColor?: string;
  /** Colour of the second lap past 100% (default amber-800). */
  overflowColor?: string;
  /** Accessible name, e.g. "1,240 of 2,000 kcal eaten today". */
  label: string;
  /** Centre content (a count-up, a caption). */
  children?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = '#944a00',
  trackColor = '#f3f4f6',
  overColor,
  overflowColor = '#92400e',
  label,
  children,
  className,
  'data-testid': testId,
}: ProgressRingProps) {
  const target = normaliseProgress(progress);
  const animated = useTween(target, duration.deliberate);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  const showOverflow = overColor !== undefined;
  const fill = mainFill(animated);
  const lap = showOverflow ? overflowFill(animated) : 0;

  const arc = {
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeDasharray: `${circumference} ${circumference}`,
    transform: `rotate(-90 ${centre} ${centre})`,
  };

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(mainFill(target) * 100)}
      data-testid={testId}
      data-over={showOverflow && isOverTarget(target) ? 'true' : undefined}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="absolute inset-0"
      >
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          {...arc}
          data-part="fill"
          stroke={progressColor(target, color, overColor)}
          strokeDashoffset={dashOffset(circumference, fill)}
          strokeOpacity={fill > VISIBLE_EPSILON ? 1 : 0}
        />
        {lap > VISIBLE_EPSILON && (
          <circle
            {...arc}
            data-part="overflow"
            stroke={overflowColor}
            strokeDashoffset={dashOffset(circumference, lap)}
          />
        )}
      </svg>
      {/* The label already carries the final value; don't read the tween. */}
      <div
        aria-hidden="true"
        className="relative flex flex-col items-center justify-center text-center"
      >
        {children}
      </div>
    </div>
  );
}
