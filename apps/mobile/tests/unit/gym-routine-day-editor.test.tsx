import { useReducer } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { RoutineDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { DayEditor } from '../../src/features/gym/routine/day-editor';
import { routineDtoToDraft } from '../../src/features/gym/routine/mapping';
import { routineDraftReducer } from '../../src/features/gym/routine/reducer';
import type { RoutineDraft } from '../../src/features/gym/routine/types';
import { makeExercise } from './gym-fixtures';
import { safeAreaMetrics } from './gym-workout-helpers';

// UX-05 amendment A4 (T-05.3, O-23): routine-editor exercise cards — compact
// one-line summary, one card expanded at a time, the name its own tap target
// (T-05.5 follow-up), Move/Swap/Remove in a "⋯" sheet, RIR + superset under
// "More", and Remove with no confirm dialog (an Undo snackbar instead, since
// the routine only changes on Save).

jest.mock('expo-crypto', () => {
  let n = 3000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

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
const onAddExercise = jest.fn();
const onSwapExercise = jest.fn();

function Harness({ make = dto }: { make?: () => RoutineDto }) {
  const [draft, dispatch] = useReducer(routineDraftReducer, make(), routineDtoToDraft);
  latest = draft;
  const day = draft.days[0];
  if (!day) return null;
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <DayEditor
        day={day}
        index={0}
        dayCount={1}
        lookup={(id) => library.get(id)}
        dispatch={dispatch}
        onAddExercise={onAddExercise}
        onSwapExercise={onSwapExercise}
      />
      <Snackbar />
    </SafeAreaProvider>
  );
}

const row = (key: string) => `routine-editor-day-d1-exercise-${key}`;
const dayBase = 'routine-editor-day-d1';

beforeEach(() => {
  latest = null;
  onAddExercise.mockClear();
  onSwapExercise.mockClear();
  resetSnackbarForTests();
});

describe('routine editor exercise cards', () => {
  it('collapse to a one-line summary and expand one at a time', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getByTestId(`${row('e1')}-summary`)).toHaveTextContent(
      '4 sets · 6–8 reps · 180 s rest',
    );
    expect(screen.getByTestId(`${row('e2')}-summary`)).toHaveTextContent(
      '3 sets · 10 reps · 90 s rest',
    );
    expect(screen.queryByTestId(`${row('e1')}-sets-inc`)).toBeNull();

    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    expect(screen.getByTestId(`${row('e1')}-sets-inc`)).toBeTruthy();

    // Opening another card collapses the first (AC25).
    await user.press(screen.getByTestId(`${row('e2')}-toggle`));
    expect(screen.queryByTestId(`${row('e1')}-sets-inc`)).toBeNull();
    expect(screen.getByTestId(`${row('e2')}-sets-inc`)).toBeTruthy();

    await user.press(screen.getByTestId(`${row('e2')}-sets-inc`));
    expect(screen.getByTestId(`${row('e2')}-summary`)).toHaveTextContent(
      '4 sets · 10 reps · 90 s rest',
    );
  });

  it('the name is its own tap target, separate from the expand/collapse toggle', async () => {
    await render(<Harness />);
    // The name link and the toggle are siblings, not nested.
    const nameLink = screen.getByTestId(`${row('e1')}-name`);
    const toggle = screen.getByTestId(`${row('e1')}-toggle`);
    expect(nameLink).toBeTruthy();
    expect(toggle).toBeTruthy();
    expect(nameLink).toHaveAccessibleName('Barbell Bench Press, view exercise');
  });

  it('RIR and "Superset with next" live under More, out of the way by default', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    expect(screen.queryByTestId(`${row('e1')}-rir`)).toBeNull();
    expect(screen.queryByTestId(`${row('e1')}-superset-next`)).toBeNull();

    await user.press(screen.getByTestId(`${row('e1')}-more`));
    expect(screen.getByTestId(`${row('e1')}-rir`)).toBeTruthy();
    expect(screen.getByTestId(`${row('e1')}-superset-next`)).toBeTruthy();

    // The day's last exercise has no "with next" toggle.
    await user.press(screen.getByTestId(`${row('e3')}-toggle`));
    await user.press(screen.getByTestId(`${row('e3')}-more`));
    expect(screen.queryByTestId(`${row('e3')}-superset-next`)).toBeNull();
  });

  it('the "⋯" sheet moves, swaps and removes a row; Remove has no confirm and offers Undo', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(screen.getByTestId(`${row('e3')}-menu`));
    expect(screen.getByTestId(`${dayBase}-menu-move-down`)).toBeDisabled();
    await user.press(screen.getByTestId(`${dayBase}-menu-move-up`));
    expect(latest?.days[0]?.exercises.map((e) => e.key)).toEqual(['e1', 'e3', 'e2']);

    await user.press(screen.getByTestId(`${row('e3')}-menu`));
    // The picker opens only once the sheet is gone (iOS can't present over a
    // dismissing Modal). The test renderer never fires iOS's onDismiss, so
    // this runs Android's path (the Modal unmounting).
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    await user.press(screen.getByTestId(`${dayBase}-menu-swap`));
    await waitFor(() => expect(onSwapExercise).toHaveBeenCalledWith('d1', 'e3'));
    platform.restore();

    await user.press(screen.getByTestId(`${row('e2')}-menu`));
    await user.press(screen.getByTestId(`${dayBase}-menu-remove`));
    expect(screen.queryByTestId(`${row('e2')}-toggle`)).toBeNull();
    expect(latest?.days[0]?.exercises.map((e) => e.key)).toEqual(['e1', 'e3']);
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Removed Barbell Row');

    await user.press(screen.getByTestId('snackbar-action'));
    expect(latest?.days[0]?.exercises.map((e) => e.key)).toEqual(['e1', 'e3', 'e2']);
  });

  it('the expanded card also has a direct Remove text button, immediate with Undo', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    await user.press(screen.getByTestId(`${row('e1')}-remove`));
    expect(latest?.days[0]?.exercises.map((e) => e.key)).toEqual(['e2', 'e3']);
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Removed Barbell Bench Press');
  });

  it('"Superset with next" links, brackets and unlinks; reordering keeps it consistent', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    await user.press(screen.getByTestId(`${row('e1')}-more`));
    expect(screen.getByTestId(`${row('e1')}-superset-next`)).not.toBeChecked();

    await user.press(screen.getByTestId(`${row('e1')}-superset-next`));
    expect(latest?.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A', null]);
    expect(screen.getByTestId(`${row('e1')}-superset-next`)).toBeChecked();
    expect(screen.getByTestId(`${row('e1')}-superset`)).toHaveTextContent('A1');
    expect(screen.getByTestId(`${row('e2')}-superset`)).toHaveTextContent('A2');
    expect(screen.getByTestId('routine-editor-day-d1-superset-A')).toHaveTextContent(
      /Superset A.*90 s rest after each round/,
    );

    // Curl steps up via the "⋯" sheet: it hops over the whole superset.
    await user.press(screen.getByTestId(`${row('e3')}-menu`));
    await user.press(screen.getByTestId(`${dayBase}-menu-move-up`));
    expect(latest?.days[0]?.exercises.map((e) => `${e.key}:${e.supersetGroup ?? '-'}`)).toEqual([
      'e3:-',
      'e1:A',
      'e2:A',
    ]);
  });

  it('day footer: Add exercise never wraps, shows the live duration, and delete is only in the day "⋯"', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getByTestId(`${dayBase}-duration`)).toHaveTextContent(/~\d+ min/);
    expect(screen.queryByTestId(`${dayBase}-delete`)).toBeNull();

    await user.press(screen.getByTestId(`${dayBase}-add-exercise`));
    expect(onAddExercise).toHaveBeenCalledWith('d1');

    await user.press(screen.getByTestId(`${dayBase}-day-menu`));
    expect(screen.getByTestId(`${dayBase}-menu-duplicate`)).toBeTruthy();
    expect(screen.getByTestId(`${dayBase}-menu-delete`)).toBeTruthy();
  });

  // plan-library-supersets S2: a visible "Superset" action per day → pick
  // sheet → "Group as superset"; "Ungroup" on the heading.
  it('"Superset" groups the picked exercises and "Ungroup" frees them', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    const sheet = `${dayBase}-superset-sheet`;

    await user.press(screen.getByTestId(`${dayBase}-superset-create`));
    expect(screen.getByTestId(`${sheet}-hint`)).toHaveTextContent(
      'Pick 2 to 4 exercises to do back to back. You rest after the round.',
    );
    expect(screen.getByTestId(`${sheet}-apply`)).toBeDisabled();
    expect(screen.getByTestId(`${sheet}-status`)).toHaveTextContent('Pick at least 2 exercises.');

    await user.press(screen.getByTestId(`${sheet}-item-e3`));
    await user.press(screen.getByTestId(`${sheet}-item-e1`));
    expect(screen.getByTestId(`${sheet}-item-e1`)).toBeChecked();
    expect(screen.getByTestId(`${sheet}-apply`)).toBeEnabled();
    await user.press(screen.getByTestId(`${sheet}-apply`));

    // The picks moved together at the first pick's place (curl hops up).
    expect(latest?.days[0]?.exercises.map((e) => `${e.key}:${e.supersetGroup ?? '-'}`)).toEqual([
      'e1:A',
      'e3:A',
      'e2:-',
    ]);
    expect(screen.getByTestId(`${dayBase}-superset-A`)).toHaveTextContent(/Superset A/);
    expect(screen.getByTestId(`${row('e3')}-superset`)).toHaveTextContent('A2');

    await user.press(screen.getByTestId(`${dayBase}-superset-A-ungroup`));
    expect(latest?.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual([null, null, null]);
    expect(screen.queryByTestId(`${dayBase}-superset-A`)).toBeNull();
  });

  it('"Superset" is disabled below 2 exercises; picks beyond 4 are disabled', async () => {
    const user = userEvent.setup();
    const one = () => {
      const r = dto();
      const day = r.days[0];
      if (day) day.exercises = day.exercises.slice(0, 1);
      return r;
    };
    const { unmount } = await render(<Harness make={one} />);
    expect(screen.getByTestId(`${dayBase}-superset-create`)).toBeDisabled();
    await unmount();

    const five = () => {
      const r = dto();
      const day = r.days[0];
      if (day) {
        day.exercises = [...day.exercises, slot('e4', 'row', 3), slot('e5', 'curl', 4)];
      }
      return r;
    };
    await render(<Harness make={five} />);
    const sheet = `${dayBase}-superset-sheet`;
    await user.press(screen.getByTestId(`${dayBase}-superset-create`));
    for (const key of ['e1', 'e2', 'e3', 'e4']) {
      await user.press(screen.getByTestId(`${sheet}-item-${key}`));
    }
    expect(screen.getByTestId(`${sheet}-item-e5`)).toBeDisabled();
    expect(screen.getByTestId(`${sheet}-status`)).toHaveTextContent(
      'That’s the most for one superset.',
    );
    // Un-ticking one frees the fifth again.
    await user.press(screen.getByTestId(`${sheet}-item-e4`));
    expect(screen.getByTestId(`${sheet}-item-e5`)).toBeEnabled();
  });
});
