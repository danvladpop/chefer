import { describe, expect, it } from 'vitest';
import {
  defaultSavedWeekName,
  dinnersHeadingFor,
  planCostCoverageLabel,
  weekRangeLabel,
  weekRelationLabel,
  weekRelationTitle,
} from './plan-week-copy';

describe('plan week copy (UX-PLAN-07)', () => {
  it('names the week from its offset', () => {
    expect(weekRelationLabel(0)).toBe('this week');
    expect(weekRelationLabel(1)).toBe('next week');
    expect(weekRelationLabel(-1)).toBe('last week');
    expect(weekRelationLabel(-3)).toBe('that week');
    expect(weekRelationTitle(1)).toBe('Next week');
  });

  it('heads the shared dinners with the right week', () => {
    expect(dinnersHeadingFor(0)).toBe('This week’s dinners');
    expect(dinnersHeadingFor(1)).toBe('Next week’s dinners');
  });

  it('labels the days a cost covers', () => {
    expect(planCostCoverageLabel(undefined)).toBe('Mon–Sun');
    expect(planCostCoverageLabel(0)).toBe('Mon–Sun');
    expect(planCostCoverageLabel(4)).toBe('Fri–Sun');
    expect(planCostCoverageLabel(6)).toBe('Sun only');
  });

  it('labels a week range and a default saved-week name', () => {
    const monday = new Date(2026, 8, 28);
    expect(weekRangeLabel(monday)).toBe('28 Sep – 4 Oct');
    expect(defaultSavedWeekName(monday)).toBe('Week of 28 Sep');
  });
});
