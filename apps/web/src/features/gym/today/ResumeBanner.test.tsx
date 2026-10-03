// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type WorkoutSessionDoc } from '@chefer/types';
import { resumeSummary } from '@chefer/utils';
import { skipRest, startRest } from '../workout/rest-timer';
import { ResumeBanner } from './ResumeBanner';

// T-36.A1.3 (UX-36 A1, AC9): the web Resume banner shows the elapsed time,
// `{e} of {E} exercises · {s} of {S} sets` and the current exercise — from the
// same pure `resumeSummary()` the phone card and the logger use.

afterEach(cleanup);

function set(id: string, position: number, done: boolean) {
  return {
    id,
    position,
    weightKg: 60,
    reps: 8,
    isWarmup: false,
    completedAt: done ? '2026-09-24T10:05:00.000Z' : null,
  };
}

function exercise(id: string, exerciseId: string, position: number, done: number, total = 3) {
  return {
    id,
    exerciseId,
    routineExerciseId: null,
    position,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 90,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    notes: null,
    prescription: {
      kind: 'hold',
      weightKg: 60,
      reps: [8],
      sets: total,
      reasonCode: 'ADD_REPS',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
    sets: Array.from({ length: total }, (_, i) => set(`${id}-${i}`, i, i < done)),
  };
}

function doc(done1: number, done2: number, localDate = '2026-09-24'): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: '00000000-0000-4000-8000-0000000000c1',
    routineId: null,
    routineDayId: null,
    name: 'Full Body B',
    status: 'IN_PROGRESS',
    startedAt: new Date(Date.now() - 23 * 60_000).toISOString(),
    finishedAt: null,
    localDate,
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-24T10:05:00.000Z',
    engineVersion: 1,
    exercises: [
      exercise('se1', 'barbell-bench-press', 0, done1),
      exercise('se2', 'seated-cable-row', 1, done2),
    ],
  } as WorkoutSessionDoc;
}

const bootstrap = { activeRoutine: null, nextWorkout: null, library: [] } as never;
const TODAY = new Date().toISOString().slice(0, 10);

describe('ResumeBanner (web)', () => {
  it('shows the ticking time, exercises and sets done, and where you are', () => {
    render(
      <ResumeBanner
        session={doc(3, 1, TODAY)}
        bootstrap={bootstrap}
        today={TODAY}
        onResume={vi.fn()}
      />,
    );
    expect(screen.getByText('WORKOUT IN PROGRESS')).toBeInTheDocument();
    expect(screen.getByTestId('gym-resume-elapsed')).toHaveTextContent(/2[23]:\d\d/);
    expect(screen.getByTestId('gym-resume-counts')).toHaveTextContent(
      '1 of 2 exercises · 4 of 6 sets',
    );
    expect(screen.getByText(/^Now: .* · set 2 of 3$/)).toBeInTheDocument();
  });

  it('agrees with the shared resumeSummary (the logger and the card never disagree)', () => {
    const d = doc(2, 0, TODAY);
    const summary = resumeSummary(d, {
      now: new Date().toISOString(),
      lookup: (id) => EXERCISE_BY_ID.get(id),
    });
    render(<ResumeBanner session={d} bootstrap={bootstrap} today={TODAY} onResume={vi.fn()} />);
    expect(screen.getByTestId('gym-resume-counts')).toHaveTextContent(
      `${summary.exercisesDone} of ${summary.exercisesTotal} exercises · ${summary.setsDone} of ${summary.setsTotal} sets`,
    );
  });

  it('everything logged: "Finish workout" replaces Resume', () => {
    const onResume = vi.fn();
    render(
      <ResumeBanner
        session={doc(3, 3, TODAY)}
        bootstrap={bootstrap}
        today={TODAY}
        onResume={onResume}
      />,
    );
    expect(screen.getByText('All sets logged · Finish when you’re ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(onResume).toHaveBeenCalled();
  });

  it('a backfilled session has no clock and reads LOGGING {weekday}', () => {
    render(
      <ResumeBanner
        session={doc(1, 0, '2026-09-20')}
        bootstrap={bootstrap}
        today={TODAY}
        onResume={vi.fn()}
      />,
    );
    expect(screen.getByText(/^LOGGING /)).toBeInTheDocument();
    expect(screen.queryByTestId('gym-resume-elapsed')).toBeNull();
  });

  // UX-GYM-09: the running rest stays visible when the logger is left.
  it('shows the running rest countdown and hides it when the rest ends', () => {
    render(
      <ResumeBanner
        session={doc(1, 0, TODAY)}
        bootstrap={bootstrap}
        today={TODAY}
        onResume={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('gym-resume-rest')).toBeNull();

    act(() => startRest(90, 'se1'));
    expect(screen.getByTestId('gym-resume-rest')).toHaveTextContent(/Rest 1:[23]\d|Rest 1:30/);
    expect(screen.getByTestId('gym-resume-rest')).not.toHaveAttribute('aria-live');

    act(() => skipRest());
    expect(screen.queryByTestId('gym-resume-rest')).toBeNull();
  });
});
