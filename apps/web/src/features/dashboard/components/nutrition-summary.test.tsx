// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingDayNutrition } from '@chefer/types';
import { NutritionSummary } from './nutrition-summary';

vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: ({ source }: { source: string }) => <button data-source={source}>Upgrade</button>,
}));

afterEach(cleanup);

const base = {
  dailyCalorieTarget: 2500,
  plannedKcal: 0,
  eatenKcal: 1000,
  protein: { planned: 0, targetG: 144, eaten: 60 },
  carbs: { planned: 0, targetG: 300, eaten: 100 },
  fat: { planned: 0, targetG: 70, eaten: 30 },
};

const trainingDay = (applied: boolean): TrainingDayNutrition => ({
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: 'Full Body A',
  kcalBonus: 250,
  proteinBonus: 32,
  applied,
  basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
});

describe('NutritionSummary — training day (audit P2-4)', () => {
  it('shows nothing extra for users who are not lifters', () => {
    render(<NutritionSummary nutrition={base} />);
    expect(screen.queryByTestId('training-day')).toBeNull();
    expect(screen.getByText('of 2,500 kcal eaten')).toBeTruthy();
  });

  it('premium: the bump is applied to the ring and the protein bar', () => {
    render(
      <NutritionSummary
        nutrition={{
          ...base,
          trainingDay: trainingDay(true),
          adjustedTargets: { dailyCalorieTarget: 2750, proteinG: 176, carbsG: 331, fatG: 70 },
        }}
      />,
    );
    expect(screen.getByText('Training day · +250 kcal, +32 g protein')).toBeTruthy();
    expect(screen.getByText(/Full Body A today · protein at 2.2 g\/kg/)).toBeTruthy();
    expect(screen.getByText('of 2,750 kcal eaten')).toBeTruthy();
    expect(screen.getByText('60g / 176g')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('not applied (older API): base targets kept, and no premium copy or upgrade (WP-07)', () => {
    render(<NutritionSummary nutrition={{ ...base, trainingDay: trainingDay(false) }} />);
    expect(screen.getByText('Training day · +250 kcal, +32 g protein')).toBeTruthy();
    expect(screen.queryByText(/Premium/)).toBeNull();
    expect(screen.getByText('of 2,500 kcal eaten')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('rest day: no line', () => {
    render(
      <NutritionSummary
        nutrition={{
          ...base,
          trainingDay: { ...trainingDay(true), isTrainingDay: false, reason: null, kcalBonus: 0 },
        }}
      />,
    );
    expect(screen.queryByTestId('training-day')).toBeNull();
  });
});

const motionBase = {
  dailyCalorieTarget: 2728,
  plannedKcal: 2700,
  eatenKcal: 2810,
  protein: { planned: 140, targetG: 140, eaten: 120 },
  carbs: { planned: 300, targetG: 300, eaten: 250 },
  fat: { planned: 91, targetG: 91, eaten: 148 },
};

describe('NutritionSummary — ring label (§2.11, T-35.5)', () => {
  it('shows no target-mode label when it is unknown', () => {
    render(<NutritionSummary nutrition={base} />);
    expect(screen.queryByTestId('target-mode-label')).toBeNull();
  });

  it.each([
    ['OWN' as const, 'Your target'],
    ['SUGGESTED' as const, 'Suggested'],
  ])('labels the ring %s -> "%s"', (mode, label) => {
    render(<NutritionSummary nutrition={base} targetMode={mode} />);
    expect(screen.getByTestId('target-mode-label')).toHaveTextContent(label);
  });
});

describe('NutritionSummary (MO-06)', () => {
  it('marks the calorie ring and only the over-target macro bar as over', () => {
    render(<NutritionSummary nutrition={motionBase} />);
    const ring = screen.getByRole('progressbar', { name: '2810 of 2728 kcal eaten today' });
    expect(ring).toHaveAttribute('data-over', 'true');
    expect(screen.getByRole('progressbar', { name: 'Fat: 148 of 91 grams eaten' })).toHaveAttribute(
      'data-over',
      'true',
    );
    expect(
      screen.getByRole('progressbar', { name: 'Protein: 120 of 140 grams eaten' }),
    ).not.toHaveAttribute('data-over');
  });

  it('animates bars with scaleX from the left, never width', () => {
    render(<NutritionSummary nutrition={motionBase} />);
    const fill = screen
      .getByRole('progressbar', { name: 'Protein: 120 of 140 grams eaten' })
      .querySelector<HTMLElement>('[data-part="fill"]');
    expect(fill).toHaveClass('origin-left');
    expect(fill?.style.transform).toMatch(/^scaleX\(/);
    expect(fill?.style.width).toBe('');
    expect(fill?.className).not.toContain('transition-all');
  });
});

describe('NutritionSummary — status pill (UX-FOOD-05)', () => {
  it('says how far over the target the day already is, never "on track"', () => {
    render(
      <NutritionSummary
        nutrition={{ ...base, dailyCalorieTarget: 1701, plannedKcal: 1700, eatenKcal: 2572 }}
        remainingPlannedKcal={759}
      />,
    );
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent('Over by 871 kcal');
  });

  it('warns the day is heading over when a planned meal tips it', () => {
    render(
      <NutritionSummary
        nutrition={{ ...base, dailyCalorieTarget: 1701, plannedKcal: 2400, eatenKcal: 1672 }}
        remainingPlannedKcal={759}
      />,
    );
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent('Heading over');
  });

  it('is on track when eaten plus remaining lands near the target', () => {
    render(
      <NutritionSummary
        nutrition={{ ...base, plannedKcal: 2400, eatenKcal: 1000 }}
        remainingPlannedKcal={1400}
      />,
    );
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent('On track');
  });
});
