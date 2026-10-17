// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXERCISE_BY_ID,
  type EquipmentProfile,
  type SessionExerciseDoc,
  type Suggestion,
} from '@chefer/types';
import { ExerciseCard, type ExerciseCardProps } from './exercise-card';

vi.mock('../../library/ExerciseImage', () => ({ ExerciseImage: () => null }));
afterEach(cleanup);

const prescription: Suggestion = {
  kind: 'hold',
  weightKg: 62.5,
  reps: [6, 6, 6, 6],
  sets: 4,
  reasonCode: 'USER_OVERRIDE',
  inputs: { loadType: 'WEIGHTED', repMin: 6, repMax: 8, overrideWeightKg: 62.5 },
  deltaKg: 0,
  engineVersion: 1,
};

const se: SessionExerciseDoc = {
  id: 'se1',
  exerciseId: 'back-squat',
  routineExerciseId: 're1',
  position: 0,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  skipped: false,
  swappedFromId: null,
  lastSetRir: null,
  prescription,
  notes: null,
  sets: [],
};

function renderCard(extra: Partial<ExerciseCardProps> = {}) {
  render(
    <ExerciseCard
      se={se}
      meta={EXERCISE_BY_ID.get('back-squat')}
      dto={undefined}
      index={0}
      expanded
      onToggleExpanded={vi.fn()}
      profile={{ unit: 'KG' } as unknown as EquipmentProfile}
      unit="KG"
      lastTime={[]}
      prSetId={null}
      prKind={null}
      onEditSet={vi.fn()}
      onToggleSet={vi.fn()}
      onSetRir={vi.fn()}
      onOpenActions={vi.fn()}
      onOpenPlates={vi.fn()}
      onOpenSetMenu={vi.fn()}
      {...extra}
    />,
  );
}

describe('ExerciseCard: coaching (workout logger)', () => {
  it('shows the trainer note under the exercise, read-only', () => {
    renderCard({ trainerNote: 'knees out, slow eccentric', trainerName: 'Ana' });
    expect(screen.getByTestId('trainer-note')).toHaveTextContent('Ana: knees out, slow eccentric');
    expect(screen.queryByRole('button', { name: 'Remove note' })).toBeNull();
  });

  it('reads "Set by Ana" for a trainer-set target instead of "Your own target"', () => {
    renderCard({ setByName: 'Ana' });
    expect(screen.getByText(/^Set by Ana: /)).toBeInTheDocument();
    expect(screen.queryByText(/Your own target/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));
    expect(screen.getByText('Set by Ana', { selector: 'dd' })).toBeInTheDocument();
  });

  it('keeps the owner wording and no note line for an uncoached exercise', () => {
    renderCard();
    expect(screen.getByText(/^Your own target: /)).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-note')).toBeNull();
  });
});
