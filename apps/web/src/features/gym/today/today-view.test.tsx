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
import { NextUpCard, OfferCard } from './today-view';

// WP-18: the coaching lines have their own tests (CoachingNotices.test.tsx).
vi.mock('@/features/coaching/components/CoachingNotices', () => ({ CoachingNotices: () => null }));
vi.mock('@/lib/trpc', () => {
  const mutation = { mutate: vi.fn(), isPending: false };
  return {
    trpc: {
      useUtils: () => ({ gym: { bootstrap: { invalidate: vi.fn() } } }),
      gym: {
        progression: {
          dismissOffer: { useMutation: () => mutation },
          startDeload: { useMutation: () => mutation },
        },
      },
    },
  };
});

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

// UX-GYM-13: the monthly recap card opens that month's recap.
describe('OfferCard — recap', () => {
  it('has a primary "See September" link to Stats with the month pre-selected', () => {
    render(
      <OfferCard
        offer={{
          kind: 'recap',
          key: 'recap:2026-09',
          title: 'Your month in review',
          body: 'body',
          data: { month: '2026-09' },
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'See September' });
    expect(link).toHaveAttribute('href', '/gym/stats?month=2026-09');
  });

  it('falls back to a plain Stats link when the offer carries no month', () => {
    render(<OfferCard offer={{ kind: 'recap', key: 'x', title: 'Recap', body: 'body' }} />);
    expect(screen.getByRole('link', { name: 'See your month' })).toHaveAttribute(
      'href',
      '/gym/stats',
    );
  });
});
