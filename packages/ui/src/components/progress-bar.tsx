'use client';

import * as React from 'react';
import { duration } from '@chefer/tokens';
import { cn } from '../lib/utils';
import { isOverTarget, mainFill, normaliseProgress, progressColor } from '../motion/progress';
import { useReducedMotion } from '../motion/use-reduced-motion';

// ─── ProgressBar ──────────────────────────────────────────────────────────────
// Horizontal progress (MO-06) — the web twin of @chefer/ui-mobile ProgressBar.
// The fill animates `transform: scaleX()` from the left — never `width`,
// which is layout work — from its previous value over `deliberate` 600 ms
// with the `enter` curve (a plain CSS transition; the reduced-motion rule in
// globals.css makes it instant). It grows from 0 after mount. Past 100% with
// an `overColor`, the fill turns that colour and a darker end cap marks the
// overflow, so 148 g of a 91 g target no longer looks merely "full".

export interface ProgressBarProps {
  /** 0..1 of the target; above 1 the bar is full (and over-coloured with `overColor`). */
  progress: number;
  color?: string;
  /** Over-target colour. Past 100% the fill switches to it and gains an end cap. */
  overColor?: string;
  /** End-cap colour past 100% (default amber-800). */
  capColor?: string;
  /** Accessible name, e.g. "Protein: 81 of 62 grams eaten". */
  label: string;
  /** Track classes — height and background (default `h-2 bg-gray-100`). */
  className?: string;
  'data-testid'?: string;
}

export function ProgressBar({
  progress,
  color = '#944a00',
  overColor,
  capColor = '#92400e',
  label,
  className,
  'data-testid': testId,
}: ProgressBarProps) {
  const target = normaliseProgress(progress);
  const over = overColor !== undefined && isOverTarget(target);
  const reduced = useReducedMotion();
  // Paint 0 first, then the value, so the first reveal animates too.
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => setShown(true), []);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(mainFill(target) * 100)}
      data-testid={testId}
      data-over={over ? 'true' : undefined}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}
    >
      <div
        data-part="fill"
        className="h-full w-full origin-left rounded-full transition-[transform,background-color] duration-deliberate ease-enter"
        style={{
          transform: `scaleX(${shown ? mainFill(target) : 0})`,
          backgroundColor: progressColor(target, color, overColor),
        }}
      />
      {/* The cap fades in once the fill has had time to reach 100%. */}
      {over && (
        <div
          data-part="cap"
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1 rounded-full animate-in fade-in-0 fill-mode-both duration-fast"
          style={{
            backgroundColor: capColor,
            animationDelay: reduced ? '0ms' : `${duration.deliberate}ms`,
          }}
        />
      )}
    </div>
  );
}
