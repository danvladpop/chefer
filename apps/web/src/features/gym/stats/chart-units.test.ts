import { describe, expect, it } from 'vitest';
import { strengthAxisLabel, toChartWeight } from './chart-units';

describe('strength chart units', () => {
  it("labels the e1RM axis in the user's unit", () => {
    expect(strengthAxisLabel('KG', false)).toBe('e1RM (kg)');
    expect(strengthAxisLabel('LB', false)).toBe('e1RM (lb)');
  });

  it('the relative view is unitless whatever the unit', () => {
    expect(strengthAxisLabel('LB', true)).toBe('× bodyweight');
    expect(strengthAxisLabel('KG', true)).toBe('× bodyweight');
  });

  it("plots kg values in the user's unit", () => {
    expect(toChartWeight(100, 'KG')).toBe(100);
    expect(toChartWeight(100, 'LB')).toBe(220.5);
  });
});
