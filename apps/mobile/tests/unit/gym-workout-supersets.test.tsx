import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymBootstrap, RoutineDto, WorkoutSessionDoc } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { getRestTimer, resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { resetFinishedForTests } from '../../src/features/gym/workout/finished-store';
import {
  derivedSupersetGroups,
  routineSlotsOf,
  supersetsOf,
} from '../../src/features/gym/workout/workout-model';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import {
  Providers,
  recordingLink,
  supersetDoc,
  supersetRoutine,
  testQueryClient,
  type LinkCall,
} from './gym-workout-helpers';

// plan-library-supersets S2: supersets made (and broken up) inside a running
// workout. Session-only by default (S-D2); "Also change my routine" saves the
// same grouping through the swap's routine.save path.

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    push: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => false),
    dismissTo: jest.fn(),
  },
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual<typeof import('react')>('react');
    mockUseEffect(cb, [cb]);
  },
}));
jest.mock('expo-crypto', () => {
  let n = 5000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const LIBRARY = [
  makeExercise('bench', 'Bench Press'),
  makeExercise('squat', 'Squat'),
  makeExercise('row', 'Barbell Row'),
];

/** The routine-backed session: bench (re-1), squat (re-2), row (re-3) on day-1. */
function routineDoc(own: boolean): WorkoutSessionDoc {
  const doc = supersetDoc();
  return {
    ...doc,
    routineId: 'routine-1',
    routineDayId: 'day-1',
    exercises: own
      ? doc.exercises.map((se, i) => ({ ...se, supersetGroup: i < 2 ? 'A' : null }))
      : doc.exercises,
  };
}

function bootstrapWith(routine: RoutineDto = supersetRoutine()): GymBootstrap {
  return makeBootstrap({ activeRoutine: routine, library: LIBRARY });
}

function currentDoc(): WorkoutSessionDoc {
  const record = activeSessionStore.get();
  if (!record) throw new Error('no active session');
  return record.doc;
}

const lettersOf = (doc: WorkoutSessionDoc) =>
  [...doc.exercises]
    .sort((a, b) => a.position - b.position)
    .map((se) => `${se.exerciseId}:${se.supersetGroup ?? '-'}`);

async function renderWorkout(
  doc: WorkoutSessionDoc,
  bootstrap: GymBootstrap,
  calls: LinkCall[] = [],
  respond: (path: string, input: unknown) => unknown = () => bootstrap,
) {
  activeSessionStore.set(doc, 'user-a');
  const queryClient = testQueryClient();
  // routine.save is a mutation: keep its cache entry from arming the default
  // 5-minute gc timer, which would hold Jest open after the run.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    mutations: { gcTime: Infinity },
  });
  queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
  await render(
    <Providers queryClient={queryClient} bootstrap={bootstrap} link={recordingLink(calls, respond)}>
      <WorkoutScreen />
      <Snackbar />
    </Providers>,
  );
  return queryClient;
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetRestTimerForTests();
  resetFinishedForTests();
  resetSnackbarForTests();
  outbox.reload();
  outbox.configure(null);
  activeSessionStore.clear();
  setGymOwner('user-a');
});

describe('workout superset helpers', () => {
  it('derivedSupersetGroups: only for a doc without its own letters', () => {
    const old = routineDoc(false);
    const groups = supersetsOf(old, bootstrapWith());
    expect(derivedSupersetGroups(old, groups)).toEqual({
      'bench-se': 'A',
      'squat-se': 'A',
      'row-se': null,
    });
    const owned = routineDoc(true);
    expect(derivedSupersetGroups(owned, supersetsOf(owned, bootstrapWith()))).toBeUndefined();
  });

  it('supersetsOf: a doc with its own letters needs no bootstrap', () => {
    expect([...supersetsOf(routineDoc(true), undefined).keys()]).toEqual(['bench-se', 'squat-se']);
    expect(supersetsOf(routineDoc(false), undefined).size).toBe(0);
  });

  it('routineSlotsOf: every pick must be a slot of the session’s day on the active routine', () => {
    const doc = routineDoc(true);
    const routine = supersetRoutine();
    expect(routineSlotsOf(doc, ['row-se', 'squat-se'], routine)).toEqual(['re-3', 're-2']);
    expect(routineSlotsOf(doc, ['row-se'], null)).toBeNull();
    expect(routineSlotsOf({ ...doc, routineDayId: null }, ['row-se'], routine)).toBeNull();
    const added = {
      ...doc,
      exercises: doc.exercises.map((se) =>
        se.id === 'row-se' ? { ...se, routineExerciseId: null } : se,
      ),
    };
    expect(routineSlotsOf(added, ['row-se', 'squat-se'], routine)).toBeNull();
  });
});

describe('WorkoutScreen — make a superset', () => {
  it('groups picks for this session only; focus and rest follow at once', async () => {
    const user = userEvent.setup();
    const calls: LinkCall[] = [];
    await renderWorkout(routineDoc(false), bootstrapWith(), calls);
    expect(screen.getByTestId('superset-A')).toBeOnTheScreen();

    await user.press(screen.getByTestId('workout-superset'));
    const sheet = 'workout-superset-sheet';
    expect(screen.getByTestId(`${sheet}-item-bench-se`)).toHaveAccessibleName(
      'Bench Press, In superset A',
    );
    await user.press(screen.getByTestId(`${sheet}-item-bench-se`));
    await user.press(screen.getByTestId(`${sheet}-item-row-se`));
    // All three are routine slots of this day → the routine box is offered, off.
    expect(screen.getByTestId(`${sheet}-also-routine`)).not.toBeChecked();
    await user.press(screen.getByTestId(`${sheet}-apply`));

    // The doc now owns its letters; row moved up next to bench; squat is alone.
    expect(lettersOf(currentDoc())).toEqual(['bench:A', 'row:A', 'squat:-']);
    expect(calls.some((c) => c.path === 'gym.routine.save')).toBe(false);
    expect(screen.getByTestId('exercise-1-superset')).toHaveTextContent('A2');
    expect(screen.queryByTestId('exercise-2-superset')).toBeNull();

    // Ticking A1 goes straight to A2 (row) with no rest.
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(getRestTimer()).toBeNull();
    await user.press(screen.getByTestId('exercise-1-set-1-check'));
    expect(getRestTimer()).toMatchObject({ seId: 'row-se', durationSec: 60 });
  });

  it('an exercise added mid-workout can join; the routine box is then not offered', async () => {
    const user = userEvent.setup();
    const doc = routineDoc(true);
    const added = {
      ...doc,
      exercises: doc.exercises.map((se) =>
        se.id === 'row-se' ? { ...se, routineExerciseId: null } : se,
      ),
    };
    await renderWorkout(added, bootstrapWith());
    await user.press(screen.getByTestId('workout-superset'));
    await user.press(screen.getByTestId('workout-superset-sheet-item-squat-se'));
    await user.press(screen.getByTestId('workout-superset-sheet-item-row-se'));
    expect(screen.queryByTestId('workout-superset-sheet-also-routine')).toBeNull();
    await user.press(screen.getByTestId('workout-superset-sheet-apply'));
    expect(lettersOf(currentDoc())).toEqual(['bench:-', 'squat:A', 'row:A']);
  });

  it('"Superset" in an exercise’s ⋯ menu opens the sheet with that exercise ticked', async () => {
    const user = userEvent.setup();
    await renderWorkout(routineDoc(true), bootstrapWith());
    await user.press(screen.getByTestId('exercise-2-menu'));
    await user.press(screen.getByTestId('menu-superset'));
    await waitFor(() =>
      expect(screen.getByTestId('workout-superset-sheet-item-row-se')).toBeChecked(),
    );
    expect(screen.getByTestId('workout-superset-sheet-apply')).toBeDisabled();
  });

  it('"Also change my routine" saves the grouping to the routine day', async () => {
    const user = userEvent.setup();
    const calls: LinkCall[] = [];
    const saved: RoutineDto = { ...supersetRoutine(), version: 2 };
    await renderWorkout(routineDoc(true), bootstrapWith(), calls, (path) =>
      path === 'gym.routine.save' ? saved : bootstrapWith(),
    );
    await user.press(screen.getByTestId('workout-superset'));
    await user.press(screen.getByTestId('workout-superset-sheet-item-squat-se'));
    await user.press(screen.getByTestId('workout-superset-sheet-item-row-se'));
    await user.press(screen.getByTestId('workout-superset-sheet-also-routine'));
    await user.press(screen.getByTestId('workout-superset-sheet-apply'));

    expect(lettersOf(currentDoc())).toEqual(['bench:-', 'squat:A', 'row:A']);
    await waitFor(() =>
      expect(screen.getByTestId('workout-notice')).toHaveTextContent(/Routine updated/),
    );
    const save = calls.find((c) => c.path === 'gym.routine.save');
    const input = save?.input as {
      routine: { days: { exercises: { id?: string; supersetGroup: string | null }[] }[] };
      expectedVersion: number;
    };
    expect(input.expectedVersion).toBe(1);
    expect(
      input.routine.days[0]?.exercises.map((e) => `${e.id}:${e.supersetGroup ?? '-'}`),
    ).toEqual(['re-1:-', 're-2:A', 're-3:A']);
  });
});

describe('WorkoutScreen — ungroup', () => {
  it('a superset made in this workout ungroups at once, session only', async () => {
    const user = userEvent.setup();
    const calls: LinkCall[] = [];
    // The routine has no supersets: this one only exists in the session.
    const plain = supersetRoutine();
    for (const day of plain.days) for (const e of day.exercises) e.supersetGroup = null;
    await renderWorkout(routineDoc(true), bootstrapWith(plain), calls);

    await user.press(screen.getByTestId('superset-A-ungroup'));
    expect(screen.queryByTestId('workout-ungroup-sheet-confirm')).toBeNull();
    expect(lettersOf(currentDoc())).toEqual(['bench:-', 'squat:-', 'row:-']);
    expect(screen.queryByTestId('superset-A')).toBeNull();

    // Back to a rest after every set.
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(getRestTimer()).toMatchObject({ seId: 'bench-se', durationSec: 120 });
    expect(calls.some((c) => c.path === 'gym.routine.save')).toBe(false);
  });

  it('a routine superset asks first; the routine changes only when ticked', async () => {
    const user = userEvent.setup();
    const calls: LinkCall[] = [];
    await renderWorkout(routineDoc(false), bootstrapWith(), calls, (path) =>
      path === 'gym.routine.save' ? { ...supersetRoutine(), version: 2 } : bootstrapWith(),
    );

    await user.press(screen.getByTestId('superset-A-ungroup'));
    expect(screen.getByTestId('workout-ungroup-sheet-title')).toHaveTextContent(
      'Ungroup superset A',
    );
    await fireEvent(
      screen.getByTestId('workout-ungroup-sheet-option-0-switch'),
      'valueChange',
      true,
    );
    await user.press(screen.getByTestId('workout-ungroup-sheet-confirm'));

    expect(lettersOf(currentDoc())).toEqual(['bench:-', 'squat:-', 'row:-']);
    await waitFor(() =>
      expect(screen.getByTestId('workout-notice')).toHaveTextContent(/Routine updated/),
    );
    const save = calls.find((c) => c.path === 'gym.routine.save');
    const input = save?.input as {
      routine: { days: { exercises: { supersetGroup: string | null }[] }[] };
    };
    expect(input.routine.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual([
      null,
      null,
      null,
    ]);
  });
});
