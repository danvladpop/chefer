import type { ColorScheme } from '@chefer/tokens';
import { useResolvedScheme } from '../hooks/use-theme-colors';

// Colours the @chefer/tokens roles don't name, per scheme (Day / Night):
// chart series, the over-target second lap (MO-06) and the week grid's
// in-between states. Everything else is a role — `useThemeColors()`.

export type ChartColors = {
  /** Categorical series colours (brand first). */
  series: readonly string[];
  /** Past-100% second lap / end cap: a stronger amber than `attention`. */
  overflow: string;
  /** Week grid: a flexible day. */
  flex: string;
  /** Week grid: a paused day. */
  paused: string;
};

const CHART_COLORS: Record<ColorScheme, ChartColors> = {
  light: {
    series: ['#944a00', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'],
    overflow: '#92400e',
    flex: '#e0a060',
    paused: '#bfdbfe',
  },
  dark: {
    series: ['#f0a35a', '#86aeff', '#6bcb93', '#f2b05e', '#b9a2ff', '#ff8fc0'],
    overflow: '#ffd39a',
    flex: '#8a5a2b',
    paused: '#2d4a7a',
  },
};

export function chartColorsFor(scheme: ColorScheme): ChartColors {
  return CHART_COLORS[scheme];
}

/** The chart colours of the active scheme. */
export function useChartColors(): ChartColors {
  return CHART_COLORS[useResolvedScheme()];
}
