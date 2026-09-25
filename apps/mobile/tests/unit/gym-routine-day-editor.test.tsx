import { useReducer } from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import { DayEditor } from '../../src/features/gym/routine/day-editor';
import { routineDtoToDraft } from '../../src/features/gym/routine/mapping';
import { routineDraftReducer } from '../../src/features/gym/routine/reducer';
import type { RoutineDraft } from '../../src/features/gym/routine/types';
import { makeExercise } from './gym-fixtures';

// Routine editor rows (G4-B): collapsed one-line summaries, expand on tap,
// "Superset with next" linking with a bracket + heading, quiet Remove.

jest.mock('expo-crypto', () => {
  let n = 2000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const library = new Map([
  ['bench', makeExercise('bench', 'Barbell Bench Press')],
  ['row', makeExercise('row', 'Barbell Row')],
  ['curl', makeExercise('curl', 'Bicep Curl')],
]);

function slot(id: string, exerciseId: string, position: number, extra = {}) {
  return {
    id,
    exerciseId,
    position,
    sets: 4,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 180,
    supersetGroup: null,
    notes: null,
    ...extra,
  };
}

function dto(): RoutineDto {
  return {
    id: 'r1',
    name: 'Mine',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Upper',
        plannedWeekday: null,
        exercises: [
          slot('e1', 'bench', 0),
          slot('e2', 'row', 1, { sets: 3, repMin: 10, repMax: 10, restSec: 90 }),
          slot('e3', 'curl', 2),
        ],
      },
    ],
  };
}

let latest: RoutineDraft | null = null;
const onRemove = jest.fn();

function Harness() {
  const [draft, dispatch] = useReducer(routineDraftReducer, dto(), routineDtoToDraft);
  latest = draft;
  const day = draft.days[0];
  if (!day) return null;
  return (
    <DayEditor
      day={day}
      index={0}
      dayCount={1}
      lookup={(id) => library.get(id)}
      dispatch={dispatch}
      onAddExercise={jest.fn()}
      onSwapExercise={jest.fn()}
      onRemoveExercise={onRemove}
    />
  );
}

const row = (key: string) => `routine-editor-day-d1-exercise-${key}`;

beforeEach(() => {
  latest = null;
  onRemove.mockClear();
});

describe('routine editor rows', () => {
  it('collapse to a one-line summary and expand on tap', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getByTestId(`${row('e1')}-toggle`)).toHaveAccessibleName(
      'Barbell Bench Press · 4 × 6–8 · 180 s',
    );
    expect(screen.getByTestId(`${row('e2')}-summary`)).toHaveTextContent('· 3 × 10 · 90 s');
    expect(screen.queryByTestId(`${row('e1')}-sets-inc`)).toBeNull();

    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    await user.press(screen.getByTestId(`${row('e1')}-sets-inc`));
    expect(screen.getByTestId(`${row('e1')}-summary`)).toHaveTextContent('· 5 × 6–8 · 180 s');

    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    expect(screen.queryByTestId(`${row('e1')}-sets-inc`)).toBeNull();
  });

  it('Remove is a quiet text button that asks the screen to confirm', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByTestId(`${row('e3')}-toggle`));
    await user.press(screen.getByTestId(`${row('e3')}-remove`));
    expect(onRemove).toHaveBeenCalledWith('d1', 'e3');
    expect(latest?.days[0]?.exercises).toHaveLength(3); // nothing removed yet
  });

  it('"Superset with next" links, brackets and unlinks; reordering keeps it consistent', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    expect(screen.getByTestId(`${row('e1')}-superset-next`)).not.toBeChecked();

    await user.press(screen.getByTestId(`${row('e1')}-superset-next`));
    expect(latest?.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A', null]);
    expect(screen.getByTestId(`${row('e1')}-superset-next`)).toBeChecked();
    expect(screen.getByTestId(`${row('e1')}-superset`)).toHaveTextContent('A1');
    expect(screen.getByTestId(`${row('e2')}-superset`)).toHaveTextContent('A2');
    // The heading uses the rest of the superset's last exercise.
    expect(screen.getByTestId('routine-editor-day-d1-superset-A')).toHaveTextContent(
      /Superset A.*90 s rest after each round/,
    );
    // The last row has no "with next" toggle.
    await user.press(screen.getByTestId(`${row('e3')}-toggle`));
    expect(screen.queryByTestId(`${row('e3')}-superset-next`)).toBeNull();

    // Curl steps up: it hops over the whole superset instead of splitting it.
    await user.press(screen.getByTestId(`${row('e3')}-up`));
    expect(latest?.days[0]?.exercises.map((e) => `${e.key}:${e.supersetGroup ?? '-'}`)).toEqual([
      'e3:-',
      'e1:A',
      'e2:A',
    ]);

    await user.press(screen.getByTestId(`${row('e1')}-superset-next`));
    expect(latest?.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual([null, null, null]);
    expect(screen.queryByTestId('routine-editor-day-d1-superset-A')).toBeNull();
  });
});
