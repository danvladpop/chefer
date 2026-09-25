// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type ExerciseMeta, type RoutineDayDto } from '@chefer/types';
import { DayCard } from './DayCard';

afterEach(cleanup);

const lookup = (id: string): ExerciseMeta | undefined => EXERCISE_BY_ID.get(id);

function re(id: string, exerciseId: string, position: number, supersetGroup: string | null) {
  return {
    id,
    exerciseId,
    position,
    sets: 3,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 120,
    supersetGroup,
    notes: null,
  };
}

const DAY: RoutineDayDto = {
  id: 'day-1',
  position: 0,
  name: 'Upper A',
  plannedWeekday: 0,
  exercises: [
    re('re-1', 'barbell-bench-press', 0, 'A'),
    re('re-2', 'back-squat', 1, 'A'),
    re('re-3', 'seated-leg-curl', 2, null),
  ],
};

describe('DayCard — supersets', () => {
  it('brackets adjacent superset exercises with a chip and a "Superset A" heading', () => {
    render(
      <DayCard
        day={DAY}
        isNextUp={false}
        unit="KG"
        lookup={lookup}
        progressionByKey={new Map()}
        onOpenOverride={vi.fn()}
      />,
    );

    expect(screen.getByTestId('routine-superset-A')).toHaveTextContent('Superset A');
    expect(screen.getByTestId('routine-superset-A')).toHaveTextContent(
      '120 s rest after each round',
    );
    const chips = screen.getAllByTestId('routine-superset-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['A1', 'A2']);
  });

  it('does not bracket a lone exercise', () => {
    const day: RoutineDayDto = {
      ...DAY,
      exercises: DAY.exercises.map((e) => ({ ...e, supersetGroup: null })),
    };
    render(
      <DayCard
        day={day}
        isNextUp={false}
        unit="KG"
        lookup={lookup}
        progressionByKey={new Map()}
        onOpenOverride={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('routine-superset-chip')).toBeNull();
    expect(screen.queryByTestId('routine-superset-A')).toBeNull();
  });
});
