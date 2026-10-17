// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingDayNutrition } from '@chefer/types';
import { TrainingDayNote } from './training-day-note';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    targets: {
      get: {
        useQuery: () => ({
          data: {
            effective: { dailyCalorieTarget: 2240, proteinG: 150, carbsG: 250, fatG: 70 },
          },
        }),
      },
    },
  },
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

  it('another day, not applied (older API): the line stays, no premium copy or upgrade', () => {
    render(<TrainingDayNote t={t(false)} isToday={false} />);
    expect(screen.getByText('Training day · +280 kcal, +32 g protein')).toBeTruthy();
    expect(screen.queryByText(/Premium/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
});

// T-06.8 / WP-07: training-day targets are free, so the applied state is the
// same for everyone; nothing here ever sells the bump as premium.
describe('TrainingDayNote applied state (T-06.8)', () => {
  it('shows the glyph line, the protein sentence and a Why? button', () => {
    render(<TrainingDayNote t={t(true)} />);
    expect(screen.getByText('Training day · +280 kcal, +32 g protein')).toBeTruthy();
    expect(
      screen.getByText('Full Body B today · protein at 2.2 g/kg, added to today'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Why?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(screen.queryByText(/Upgrade from your Profile/)).toBeNull();
  });

  it('a run day says "Mostly carbs, added to today" and uses the run copy', () => {
    render(<TrainingDayNote t={{ ...t(true), kind: 'run', proteinBonus: 0 }} />);
    expect(screen.getByText('Run day · +280 kcal, mostly carbs')).toBeTruthy();
    expect(screen.getByText('Mostly carbs, added to today')).toBeTruthy();
  });

  it('Why? opens the explain dialog built from the training copy', () => {
    render(<TrainingDayNote t={t(true)} />);
    expect(screen.queryByTestId('training-explain')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('More food on training days');
    expect(dialog.textContent).toContain('2,240 kcal · 150 g protein');
    expect(screen.getByRole('link', { name: 'Change training days' }).getAttribute('href')).toBe(
      '/gym/settings',
    );
  });

  it('not applied: no Why?, and no upgrade (WP-07: free for everyone)', () => {
    render(<TrainingDayNote t={t(false)} />);
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(screen.queryByText(/Premium/)).toBeNull();
  });

  it('another day without a date offers no Why? (it would name the wrong weekday)', () => {
    render(<TrainingDayNote t={t(true)} isToday={false} />);
    expect(screen.queryByRole('button', { name: 'Why?' })).toBeNull();
  });
});
