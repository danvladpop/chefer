// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXERCISE_BY_ID,
  type ExerciseMeta,
  type NextWorkoutDto,
  type Suggestion,
} from '@chefer/types';
import { NextUpCard } from './today-view';

afterEach(cleanup);

const lookup = (id: string): ExerciseMeta | undefined => EXERCISE_BY_ID.get(id);

function suggestion(): Suggestion {
  return {
    kind: 'start',
    weightKg: 60,
    reps: [10, 10, 10],
    sets: 3,
    reasonCode: 'START',
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
  };
}

function nextExercise(
  routineExerciseId: string,
  exerciseId: string,
  position: number,
  supersetGroup: string | null,
) {
  return {
    routineExerciseId,
    exerciseId,
    position,
    sets: 3,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 120,
    supersetGroup,
    notes: null,
    repBucket: '6-10',
    suggestion: suggestion(),
    warmups: [],
    lastTime: null,
  };
}

const NEXT: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Upper A',
  isDeload: false,
  estimatedMin: 45,
  exercises: [
    nextExercise('re-1', 'barbell-bench-press', 0, 'A'),
    nextExercise('re-2', 'back-squat', 1, 'A'),
    nextExercise('re-3', 'seated-leg-curl', 2, null),
  ],
};

describe('NextUpCard — supersets', () => {
  it('brackets adjacent superset exercises with a chip and a "Superset A" heading', () => {
    render(
      <NextUpCard
        next={NEXT}
        unit="KG"
        lookup={lookup}
        doneToday={false}
        hasActive={false}
        onStart={vi.fn()}
        onPickDay={vi.fn()}
        onSkip={vi.fn()}
        busy={false}
      />,
    );

    expect(screen.getByTestId('routine-superset-A')).toHaveTextContent('Superset A');
    const chips = screen.getAllByTestId('gym-next-up-superset-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['A1', 'A2']);
  });

  it('does not bracket a lone exercise', () => {
    const next: NextWorkoutDto = {
      ...NEXT,
      exercises: NEXT.exercises.map((e) => ({ ...e, supersetGroup: null })),
    };
    render(
      <NextUpCard
        next={next}
        unit="KG"
        lookup={lookup}
        doneToday={false}
        hasActive={false}
        onStart={vi.fn()}
        onPickDay={vi.fn()}
        onSkip={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.queryByTestId('gym-next-up-superset-chip')).toBeNull();
    expect(screen.queryByTestId('routine-superset-A')).toBeNull();
  });
});
