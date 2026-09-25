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
