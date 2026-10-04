import type { WeightUnit } from '@chefer/types';
import { kgToUnit, unitLabel } from '@chefer/utils';

// The strength chart's weight axis follows the user's unit (kg/lb). The API
// stores kg; the phone's `strength-trend-view.tsx` converts the same way.

/** Left Y-axis title: the ratio view is unitless, otherwise e1RM in the user's unit. */
export function strengthAxisLabel(unit: WeightUnit, relative: boolean): string {
  return relative ? '× bodyweight' : `e1RM (${unitLabel(unit)})`;
}

/** A kg value as plotted on the chart's weight axes. */
export function toChartWeight(kg: number, unit: WeightUnit): number {
  return kgToUnit(kg, unit);
}
