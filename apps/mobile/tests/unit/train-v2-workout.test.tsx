import { render, screen, userEvent } from '@testing-library/react-native';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { resetFinishedForTests } from '../../src/features/gym/workout/finished-store';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';
import { makeBootstrap } from './gym-fixtures';
import { activeDoc, Providers, testQueryClient } from './gym-workout-helpers';

// 10 Oct redesign — the live workout in the new shell (board "Workout"): the
// brand header (minimise, name, Finish pill, Time, Sets n / m, progress bar,
// no kcal) and the list foot (Add exercise + Superset tinted, Save for later,
// Discard). Same mocks as gym-workout.test.tsx; the shell flag is forced on.

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    push: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => false),
    dismissTo: jest.fn(),
  },
  // Focus effects run like plain effects in a test render.
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual<typeof import('react')>('react');
    mockUseEffect(cb, [cb]);
  },
}));
jest.mock('expo-crypto', () => {
  let n = 1000;
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

const mockShellV2 = { current: true };
jest.mock('../../src/features/shell/shell-store', () => ({
  useShellV2: () => mockShellV2.current,
}));

const { router } = jest.requireMock<{ router: { replace: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

async function renderWorkout(doc: WorkoutSessionDoc, bootstrap: GymBootstrap = makeBootstrap()) {
  activeSessionStore.set(doc, 'user-a');
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
  mockShellV2.current = true;
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetRestTimerForTests();
  resetFinishedForTests();
  resetSnackbarForTests();
  outbox.reload();
  outbox.configure(null);
  activeSessionStore.clear();
  setGymOwner('user-a');
  router.replace.mockClear();
  router.back.mockClear();
});

describe('Live workout header (new shell)', () => {
  it('shows the name, elapsed time, sets done of planned and a progress bar — no kcal', async () => {
    await renderWorkout(activeDoc());
    expect(screen.getByTestId('workout-header')).toBeOnTheScreen();
    expect(screen.getByTestId('workout-title')).toHaveTextContent('Upper A');
    expect(screen.getByTestId('workout-elapsed')).toHaveTextContent(/^20:0\d$/);
    expect(screen.getByTestId('workout-progress').props.accessibilityLabel).toBe(
      '0 of 3 sets done',
    );
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0 \/ 3/);
    expect(screen.getByTestId('workout-progress-bar')).toBeOnTheScreen();
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it('ticking a set moves the sets count', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(screen.getByTestId('workout-progress').props.accessibilityLabel).toBe(
      '1 of 3 sets done',
    );
  });

  it('Finish with sets left asks first (the same finish sheet)', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('workout-finish'));
    expect(screen.getByTestId('workout-finish-sheet')).toBeOnTheScreen();
  });

  it('minimise leaves the workout', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('workout-minimise'));
    expect(router.back.mock.calls.length + router.replace.mock.calls.length).toBeGreaterThan(0);
  });

  it('the list foot: Add exercise, Superset, Save for later and Discard', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    expect(screen.getByTestId('workout-add-exercise')).toBeOnTheScreen();
    expect(screen.getByTestId('workout-superset').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByTestId('workout-save-for-later')).toBeOnTheScreen();
    expect(screen.queryByTestId('workout-finish-bottom')).toBeNull();
    await user.press(screen.getByTestId('workout-discard'));
    expect(screen.getByTestId('workout-discard-sheet')).toBeOnTheScreen();
  });

  it('the old shell keeps the old header', async () => {
    mockShellV2.current = false;
    await renderWorkout(activeDoc());
    expect(screen.queryByTestId('workout-header')).toBeNull();
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0\/3 sets/);
    expect(screen.getByTestId('workout-finish-bottom')).toBeOnTheScreen();
  });
});
