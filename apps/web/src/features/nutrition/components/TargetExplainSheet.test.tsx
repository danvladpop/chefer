// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TargetsView } from '@chefer/types';
import { TargetExplainSheet } from './TargetExplainSheet';

// UX-11 AC3: tapping the ring/macro/day-totals opens this sheet.

afterEach(cleanup);

const SUGGESTED_VIEW: TargetsView = {
  effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  source: 'suggested',
  inputs: {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activity: 'MODERATELY_ACTIVE',
    goal: 'MAINTAIN',
    isLifter: false,
    proteinGPerKg: null,
    usedAdjustedWeight: false,
    rate: 'Maintenance calories',
  },
};

const OWN_VIEW: TargetsView = { ...SUGGESTED_VIEW, source: 'own' };

describe('TargetExplainSheet', () => {
  it('shows the resolved numbers and the formula sentence for a suggested target', () => {
    render(<TargetExplainSheet open onClose={vi.fn()} view={SUGGESTED_VIEW} />);
    expect(screen.getByText('2,200 kcal')).toBeTruthy();
    expect(screen.getByText(/Mifflin–St Jeor/)).toBeTruthy();
    expect(screen.getByText('Set your own target')).toBeTruthy();
  });

  it('shows "you set this" for an own target, with the reverse action', () => {
    render(<TargetExplainSheet open onClose={vi.fn()} view={OWN_VIEW} />);
    expect(screen.getByText('You set this target yourself.')).toBeTruthy();
    expect(screen.getByText('Use the suggested target')).toBeTruthy();
  });

  it('renders no numbers while the view is still loading', () => {
    render(<TargetExplainSheet open onClose={vi.fn()} view={undefined} />);
    expect(screen.queryByText('2,200 kcal')).toBeNull();
  });
});
