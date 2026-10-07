// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PLAN_FEATURES, RETIRED_PLAN_FEATURE_KEYS } from '@chefer/types';
import { PremiumComparisonTable } from './PremiumComparisonTable';

afterEach(cleanup);

describe('PremiumComparisonTable — retired features (WP-24 / FB7-10)', () => {
  it('has no row for the retired pantry feature', () => {
    render(<PremiumComparisonTable />);
    expect(RETIRED_PLAN_FEATURE_KEYS).toContain('pantryPlanning');
    expect(screen.queryByText(PLAN_FEATURES.pantryPlanning.label)).toBeNull();
    expect(screen.queryByText(/pantry/i)).toBeNull();
  });

  it('still lists a live premium feature', () => {
    render(<PremiumComparisonTable />);
    expect(screen.getByText(PLAN_FEATURES.householdPlans.label)).toBeTruthy();
  });
});
