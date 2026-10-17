// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXERCISE_BY_ID,
  type ProgressionDto,
  type RoutineDayDto,
  type Suggestion,
} from '@chefer/types';
import { progressionKey } from '@chefer/utils';
import { DayCard } from './DayCard';

afterEach(cleanup);

const lookup = (id: string) => EXERCISE_BY_ID.get(id);

const base = {
  sets: 3,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  notes: null,
};

const DAY: RoutineDayDto = {
  id: 'd1',
  position: 0,
  name: 'Day A',
  plannedWeekday: 0,
  exercises: [
    {
      ...base,
      id: 're1',
      exerciseId: 'back-squat',
      position: 0,
      trainerNote: 'knees out, slow eccentric',
      lastEditedByOther: { name: 'Ana', at: '2026-10-02T12:00:00.000Z' },
    },
    { ...base, id: 're2', exerciseId: 'seated-leg-curl', position: 1 },
  ],
};

const suggestion: Suggestion = {
  kind: 'hold',
  weightKg: 62.5,
  reps: [6, 6, 6, 6],
  sets: 4,
  reasonCode: 'USER_OVERRIDE',
  inputs: {},
  deltaKg: 0,
  engineVersion: 1,
};

describe('DayCard: coaching display (client side)', () => {
  it('shows "Changed by Ana · 2 Oct" and the trainer note on exactly the changed row', () => {
    render(
      <DayCard
        day={DAY}
        isNextUp={false}
        unit="KG"
        lookup={lookup}
        progressionByKey={new Map()}
        onOpenOverride={vi.fn()}
        trainerName="Ana"
      />,
    );
    expect(screen.getAllByTestId('changed-by')).toHaveLength(1);
    expect(screen.getByTestId('changed-by')).toHaveTextContent('Changed by Ana · 2 Oct');
    expect(screen.getAllByTestId('trainer-note')).toHaveLength(1);
    expect(screen.getByTestId('trainer-note')).toHaveTextContent('Ana: knees out, slow eccentric');
  });

  it('shows nothing extra for an uncoached routine', () => {
    render(
      <DayCard
        day={{
          ...DAY,
          exercises: DAY.exercises
            .map((e) => ({ ...e, trainerNote: null }))
            .map(({ lastEditedByOther: _l, ...e }) => e),
        }}
        isNextUp={false}
        unit="KG"
        lookup={lookup}
        progressionByKey={new Map()}
        onOpenOverride={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('changed-by')).toBeNull();
    expect(screen.queryByTestId('trainer-note')).toBeNull();
  });

  it('labels a trainer-set target "Set by Ana" instead of "Edited"', () => {
    const progression: ProgressionDto = {
      exerciseId: 'back-squat',
      repBucket: '6-8',
      state: {} as ProgressionDto['state'],
      override: {
        weightKg: 62.5,
        reps: [6, 6, 6, 6],
        at: '2026-10-02T12:00:00.000Z',
        setByName: 'Ana',
      },
      suggestion,
    };
    render(
      <DayCard
        day={DAY}
        isNextUp={false}
        unit="KG"
        lookup={lookup}
        progressionByKey={new Map([[progressionKey('back-squat', '6-8'), progression]])}
        onOpenOverride={vi.fn()}
        trainerName="Ana"
      />,
    );
    const rows = screen.getAllByRole('button');
    expect(screen.getByText('Set by Ana')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Set by Ana')).toBeNull();
    expect(screen.queryByText('Edited')).toBeNull();
  });
});
