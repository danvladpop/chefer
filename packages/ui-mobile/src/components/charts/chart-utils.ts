import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface Extent {
  min: number;
  max: number;
}

/** min/max of the finite values, padded so points never touch the edges. */
export function paddedExtent(values: readonly number[], padRatio = 0.08): Extent | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return null;
  }
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    // A flat series still needs a visible band around it.
    const pad = Math.abs(min) * 0.05 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * padRatio;
  min -= pad;
  max += pad;
  return { min, max };
}

/** 1, 2, 5 × 10ⁿ at or above `raw`: the step a human would pick for an axis. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * UX-FOOD-20: widen `extent` to round bounds and return the round gridline
 * values between them (0 / 1,000 / 2,000 / 3,000 instead of -149.6 / 1,126 /
 * 2,400). Aims for about `count` ticks; the returned extent contains the input.
 */
export function niceTicks(extent: Extent, count = 4): Extent & { ticks: number[] } {
  const span = extent.max - extent.min;
  if (!(span > 0) || count < 2) return { ...extent, ticks: [extent.min, extent.max] };
  const step = niceStep(span / (count - 1));
  const min = Math.floor(extent.min / step + 1e-9) * step;
  const max = Math.ceil(extent.max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min, max, ticks };
}

/**
 * Anchor for an x-axis label centred on `centre`: the centre when the label
 * fits, else pushed in so its text never runs off either edge of the chart
 * (the last label used to be clipped).
 */
export function clampLabelCentre(
  centre: number,
  label: string,
  chartWidth: number,
  glyphWidth = 6,
): number {
  const half = (label.length * glyphWidth) / 2;
  return Math.min(Math.max(centre, half), Math.max(half, chartWidth - half));
}

/** Maps [domain.min, domain.max] onto [from, to]. A zero-width domain maps to the midpoint. */
export function linearScale(domain: Extent, from: number, to: number): (value: number) => number {
  const span = domain.max - domain.min;
  if (span === 0) {
    return () => (from + to) / 2;
  }
  return (value) => from + ((value - domain.min) / span) * (to - from);
}

/** Compact axis label: 1234 → "1.2k", 62.5 → "62.5", 60 → "60". */
export function defaultFormat(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value * 10) / 10);
}

/**
 * Width from an explicit prop, else measured via onLayout (charts fill their
 * container). Returns 0 until measured — render nothing in that case.
 */
export function useChartWidth(width: number | undefined): {
  width: number;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const [measured, setMeasured] = useState(0);
  return {
    width: width ?? measured,
    onLayout: (event) => {
      const next = Math.round(event.nativeEvent.layout.width);
      if (width === undefined && next !== measured) {
        setMeasured(next);
      }
    },
  };
}
