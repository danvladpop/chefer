// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingDayNutrition } from '@chefer/types';
import { TrainingDayNote } from './training-day-note';

vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: ({ source }: { source: string }) => <button data-source={source}>Upgrade</button>,
}));

afterEach(cleanup);

const t = (applied: boolean): TrainingDayNutrition => ({
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: 'Full Body B',
  kcalBonus: 280,
  proteinBonus: 32,
  applied,
  basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
});

// The tracker reuses Today's line (audit P2-4 follow-up); on other days the
// copy must not claim "today".
describe('TrainingDayNote on the tracker', () => {
  it('another day, premium: says "this day", not "today"', () => {
    render(<TrainingDayNote t={t(true)} isToday={false} />);
    expect(screen.getByText('Training day · +280 kcal, +32 g protein')).toBeTruthy();
    expect(
      screen.getByText(/Full Body B planned · protein at 2.2 g\/kg, added to this day/),
    ).toBeTruthy();
    expect(screen.queryByText(/today/)).toBeNull();
  });

  it('another day, free: locked with the upgrade', () => {
    render(<TrainingDayNote t={t(false)} isToday={false} />);
    expect(screen.getByText(/Premium adds this to this day's targets/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeTruthy();
  });
});
