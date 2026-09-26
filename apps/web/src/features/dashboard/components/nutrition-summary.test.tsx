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

  it('free: the same line locked, base targets kept, upgrade one tap away', () => {
    render(<NutritionSummary nutrition={{ ...base, trainingDay: trainingDay(false) }} />);
    expect(screen.getByText('Training day · +250 kcal, +32 g protein')).toBeTruthy();
    expect(screen.getByText(/Premium adds this/)).toBeTruthy();
    expect(screen.getByText('of 2,500 kcal eaten')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upgrade' }).getAttribute('data-source')).toBe(
      'training-day',
    );
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
