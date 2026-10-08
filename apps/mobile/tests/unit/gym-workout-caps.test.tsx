import { render, screen, userEvent } from '@testing-library/react-native';
import {
  GYM_MAX_EXERCISES_PER_SESSION,
  GYM_MAX_SETS_PER_EXERCISE,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { resetFinishedForTests } from '../../src/features/gym/workout/finished-store';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { Providers, supersetDoc, testQueryClient } from './gym-workout-helpers';

// UX-GYM-01: the session schema caps a workout at 20 sets per exercise and 30
// exercises; "Add set" / "Add exercise" stop there and say why instead of
// creating a workout that can never sync.

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

const LIBRARY = [makeExercise('bench', 'Bench Press'), makeExercise('squat', 'Squat')];

function docWith(setCount: number, exerciseCount: number): WorkoutSessionDoc {
  const base = supersetDoc();
  const template = base.exercises[0];
  if (!template) throw new Error('fixture');
  const exercises = Array.from({ length: exerciseCount }, (_, i) => ({
    ...template,
    id: `ex-${String(i)}`,
    position: i,
    routineExerciseId: null,
    sets: Array.from({ length: setCount }, (_, n) => ({
      id: `ex-${String(i)}-set-${String(n)}`,
      position: n,
      weightKg: 60,
      reps: 10,
      isWarmup: false,
      completedAt: null,
    })),
  }));
  return { ...base, routineId: null, routineDayId: null, exercises };
}

async function renderWorkout(doc: WorkoutSessionDoc) {
  activeSessionStore.set(doc, 'user-a');
  const bootstrap = makeBootstrap({ library: LIBRARY });
  const queryClient = testQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
  await render(
    <Providers queryClient={queryClient} bootstrap={bootstrap}>
      <WorkoutScreen />
      <Snackbar />
    </Providers>,
  );
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

describe('WorkoutScreen caps', () => {
  it('"Add set" is available below the cap', async () => {
    await renderWorkout(docWith(GYM_MAX_SETS_PER_EXERCISE - 1, 2));
    expect(screen.getByTestId('exercise-0-add-set')).toBeEnabled();
    expect(screen.queryByTestId('exercise-0-add-set-reason')).toBeNull();
  });

  it('"Add set" is disabled at 20 sets with the reason', async () => {
    await renderWorkout(docWith(GYM_MAX_SETS_PER_EXERCISE, 2));
    expect(screen.getByTestId('exercise-0-add-set')).toBeDisabled();
    expect(screen.getByTestId('exercise-0-add-set-reason')).toHaveTextContent(
      `Max ${String(GYM_MAX_SETS_PER_EXERCISE)} sets per exercise.`,
    );
  });

  it('the ⋯ menu "Add set" is disabled at the cap', async () => {
    const user = userEvent.setup();
    await renderWorkout(docWith(GYM_MAX_SETS_PER_EXERCISE, 2));
    await user.press(screen.getByTestId('exercise-0-menu'));
    expect(screen.getByTestId('menu-add-set')).toBeDisabled();
  });

  it('"Add exercise" is disabled at 30 exercises with the reason', async () => {
    await renderWorkout(docWith(1, GYM_MAX_EXERCISES_PER_SESSION));
    expect(screen.getByTestId('workout-add-exercise')).toBeDisabled();
    expect(screen.getByTestId('workout-add-exercise-reason')).toHaveTextContent(
      `Max ${String(GYM_MAX_EXERCISES_PER_SESSION)} exercises per workout.`,
    );
  });

  it('"Add exercise" is available below the cap', async () => {
    await renderWorkout(docWith(1, GYM_MAX_EXERCISES_PER_SESSION - 1));
    expect(screen.getByTestId('workout-add-exercise')).toBeEnabled();
  });
});
