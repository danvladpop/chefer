// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachedWorkoutDto } from '@chefer/types';
import { WorkoutList } from './WorkoutsTab';

vi.mock('@/lib/trpc', () => ({ trpc: {} }));
afterEach(cleanup);

const workout: CoachedWorkoutDto = {
  id: 'w1',
  name: 'Lower A',
  localDate: '2026-09-30',
  startedAt: '2026-09-30T17:00:00.000Z',
  finishedAt: '2026-09-30T18:05:00.000Z',
  durationMin: 65,
  isDeload: false,
  exercises: [
    {
      exerciseId: 'back-squat',
      name: 'Back Squat',
      skipped: false,
      lastSetRir: 2,
      sets: [
        { weightKg: 20, reps: 10, isWarmup: true, completed: true },
        { weightKg: 60, reps: 8, isWarmup: false, completed: true },
        { weightKg: 60, reps: 8, isWarmup: false, completed: true },
        { weightKg: 60, reps: 6, isWarmup: false, completed: false },
      ],
    },
    {
      exerciseId: 'seated-leg-curl',
      name: 'Seated Leg Curl',
      skipped: true,
      lastSetRir: null,
      sets: [],
    },
  ],
};

describe('WorkoutList', () => {
  it('shows date, name, duration, sets with warm-ups marked, skipped and last-set effort', () => {
    const onOpen = vi.fn();
    render(<WorkoutList workouts={[workout]} unit="KG" onOpenExercise={onOpen} />);
    const card = screen.getByTestId('trainer-workout');
    expect(card).toHaveTextContent('Lower A');
    expect(card).toHaveTextContent('Wed 30 Sep · 65 min');
    expect(card).toHaveTextContent('W 20 kg × 10 · 60 kg × 8 · 60 kg × 8');
    expect(card).not.toHaveTextContent('60 kg × 6'); // an unticked set was not done
    expect(card).toHaveTextContent('Last set: 2 in reserve');
    expect(card).toHaveTextContent('Skipped');
    fireEvent.click(screen.getByRole('button', { name: 'Back Squat' }));
    expect(onOpen).toHaveBeenCalledWith('back-squat', 'Back Squat');
  });

  it('shows the empty state', () => {
    render(<WorkoutList workouts={[]} unit="KG" />);
    expect(screen.getByText('No completed workouts yet.')).toBeInTheDocument();
  });
});
