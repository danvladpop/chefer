// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanTrainingDay } from '@chefer/types';
import { DayView } from './day-view';

// T-06.8: training glyphs on the day chips, the header above a training day's
// meals, and the pre-run note on the day before a long run.

vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));

afterEach(cleanup);

const meal = {
  type: 'dinner',
  recipe: {
    id: 'r1',
    name: 'Chicken Rice Bowl',
    description: '',
    cuisineType: 'asian',
    prepTimeMins: 10,
    cookTimeMins: 20,
    nutritionInfo: { calories: 700, protein: 40, carbs: 60, fat: 20, fiber: 5 },
  },
};
const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, meals: [meal] }));

const day = (
  over: Partial<PlanTrainingDay> & Pick<PlanTrainingDay, 'dayOfWeek' | 'kind'>,
): PlanTrainingDay => ({
  dayName: 'Wednesday',
  workoutName: 'Upper A',
  kcalBonus: 300,
  proteinBonus: 31,
  carbsBonus: 0,
  done: false,
  applied: true,
  targetKcal: 2540,
  targetProteinG: 165,
  ...over,
});

const training: PlanTrainingDay[] = [
  day({ dayOfWeek: 2, kind: 'lift' }),
  day({
    dayOfWeek: 6,
    dayName: 'Sunday',
    kind: 'long_run',
    workoutName: null,
    kcalBonus: 450,
    proteinBonus: 0,
    targetKcal: 2690,
    preRunSnack: 'a banana on toast with honey',
  }),
];

const renderView = (selectedDay: number, onOpen = vi.fn()) =>
  render(
    <DayView
      days={days}
      planId="p1"
      selectedDay={selectedDay}
      onSelectDay={vi.fn()}
      calorieTarget={2240}
      trainingDays={training}
      onOpenTrainingExplain={onOpen}
    />,
  );

describe('DayView training days', () => {
  it('marks training-day chips with a glyph and an accessible label', () => {
    renderView(0);
    expect(screen.getByRole('tab', { name: 'Wednesday, training day' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sunday, long run day' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Monday' })).toBeTruthy();
    expect(screen.getAllByTestId('training-glyph')).toHaveLength(2);
  });

  it('shows the header above a training day and opens the explain dialog', () => {
    const onOpen = vi.fn();
    renderView(2, onOpen);
    const header = screen.getByTestId('training-day-header');
    expect(header.textContent).toContain('Training day · Upper A');
    expect(header.textContent).toContain('Target this day 2,540 kcal · 165 g protein');
    expect(header.textContent).toContain('(+300 kcal, +31 g protein for training)');
    fireEvent.click(header);
    expect(onOpen).toHaveBeenCalled();
  });

  it('a rest day has no header and no pre-run note', () => {
    renderView(0);
    expect(screen.queryByTestId('training-day-header')).toBeNull();
    expect(screen.queryByTestId('pre-run-note')).toBeNull();
  });

  it('the day before a long run shows the carb-snack note', () => {
    renderView(5);
    expect(screen.getByTestId('pre-run-note').textContent).toBe(
      'Long run tomorrow. A carb snack tonight helps: for example, a banana on toast with honey.',
    );
  });

  it('a training day uses its bumped target for the day status', () => {
    // 700 kcal against the applied 2,540 target is far under it.
    renderView(2);
    expect(screen.getByTestId('day-target-status').textContent).toContain('About 1,840 kcal under');
  });
});
