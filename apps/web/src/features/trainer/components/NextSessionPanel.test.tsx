// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXERCISE_BY_ID,
  type NextTargetDto,
  type Suggestion,
  type TrainerRoutineDto,
  type TrainerRoutineExerciseDto,
} from '@chefer/types';
import { NextSessionPanel, nextTargetState } from './NextSessionPanel';

afterEach(cleanup);

const lookup = (id: string) => EXERCISE_BY_ID.get(id);

const suggestion: Suggestion = {
  kind: 'hold',
  weightKg: 60,
  reps: [8, 8, 8],
  sets: 3,
  reasonCode: 'CONSOLIDATE',
  inputs: {},
  deltaKg: 0,
  engineVersion: 1,
};

function row(
  id: string,
  exerciseId: string,
  next: NextTargetDto | null,
): TrainerRoutineExerciseDto {
  return {
    id,
    exerciseId,
    position: 0,
    sets: 3,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    trainerNote: null,
    lastEditedByOther: null,
    next,
  };
}

function routineWith(rows: TrainerRoutineExerciseDto[]): TrainerRoutineDto {
  return {
    id: 'r1',
    name: 'Push Pull Legs',
    templateKey: null,
    version: 3,
    nextDayId: 'd2',
    updatedAt: '2026-10-02T10:00:00.000Z',
    lastEditedByOther: null,
    days: [
      { id: 'd1', position: 0, name: 'Day A', plannedWeekday: 0, exercises: [] },
      { id: 'd2', position: 1, name: 'Day B', plannedWeekday: 3, exercises: rows },
    ],
    exercises: [],
  };
}

function renderPanel(
  next: NextTargetDto,
  handlers = { onAdjust: vi.fn<[unknown], undefined>(), onReset: vi.fn<[unknown], undefined>() },
) {
  render(
    <NextSessionPanel
      routine={routineWith([row('re1', 'back-squat', next)])}
      clientName="Maria"
      unit="KG"
      lookup={lookup}
      busy={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe('NextSessionPanel', () => {
  it('highlights the next day with its planned weekday', () => {
    renderPanel({ repBucket: '6-8', suggestion, override: null, lastDoneDate: null });
    expect(screen.getByTestId('trainer-next-day')).toHaveTextContent('Next: Day B · planned Thu');
  });

  it('state: app suggestion', () => {
    renderPanel({ repBucket: '6-8', suggestion, override: null, lastDoneDate: null });
    const rowEl = screen.getByTestId('trainer-next-row');
    expect(within(rowEl).getByText('60 kg × 8, 8, 8 · app suggestion')).toBeInTheDocument();
    expect(within(rowEl).queryByRole('button', { name: /Reset to app suggestion/ })).toBeNull();
    expect(
      within(rowEl).getByText(/Applies the next time Maria does .* \(6–8 reps\)\./),
    ).toBeInTheDocument();
  });

  it('state: set by you, with a reset', () => {
    const next: NextTargetDto = {
      repBucket: '6-8',
      suggestion,
      override: {
        weightKg: 62.5,
        reps: [6, 6, 6, 6],
        at: '2026-10-02T12:00:00.000Z',
        setBy: 'TRAINER',
      },
      lastDoneDate: null,
    };
    const { onReset } = renderPanel(next);
    expect(nextTargetState(next)).toBe('trainer');
    expect(screen.getByText('62.5 kg × 6, 6, 6, 6 · set by you 2 Oct')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset to app suggestion/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('state: set by the client', () => {
    const next: NextTargetDto = {
      repBucket: '6-8',
      suggestion,
      override: { weightKg: 55, reps: [8, 8, 8], at: '2026-10-03T12:00:00.000Z', setBy: 'CLIENT' },
      lastDoneDate: null,
    };
    renderPanel(next);
    expect(nextTargetState(next)).toBe('client');
    expect(screen.getByText('55 kg × 8, 8, 8 · set by the client 3 Oct')).toBeInTheDocument();
  });

  it('state: used (the target was consumed): the suggestion again, with the last date', () => {
    renderPanel({ repBucket: '6-8', suggestion, override: null, lastDoneDate: '2026-10-03' });
    expect(screen.getByText('Last done 3 Oct')).toBeInTheDocument();
    expect(screen.getByText('60 kg × 8, 8, 8 · app suggestion')).toBeInTheDocument();
  });

  it('Adjust hands the row to the caller', () => {
    const { onAdjust } = renderPanel({
      repBucket: '6-8',
      suggestion,
      override: null,
      lastDoneDate: null,
    });
    fireEvent.click(screen.getByRole('button', { name: /^Adjust: / }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onAdjust.mock.calls[0]?.[0]).toMatchObject({ row: { id: 're1' } });
  });

  it('lists only strength rows (no next target on cardio)', () => {
    render(
      <NextSessionPanel
        routine={routineWith([row('re1', 'back-squat', null)])}
        clientName="Maria"
        unit="KG"
        lookup={lookup}
        busy={false}
        onAdjust={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('trainer-next-row')).toBeNull();
  });
});
