import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { CoachedWorkoutDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox as ownerOutbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { WorkoutMiniBar } from '../../src/features/shell/workout-mini-bar';
import { savePrefetchedStart } from '../../src/features/trainer-coach/coach-prefetch';
import { CoachScreen } from '../../src/features/trainer-coach/coach-screen';
import { coachedOutboxes } from '../../src/features/trainer-coach/coached-outbox';
import { coachedSessionStore } from '../../src/features/trainer-coach/coached-session-store';
import { startCoaching } from '../../src/features/trainer-coach/coached-start';
import {
  finishCoachedWithDefaults,
  startCoachedWorkout,
} from '../../src/features/trainer-coach/coached-workouts';
import { LogCoachedWorkoutButton } from '../../src/features/trainer-coach/log-workout-button';
import { WorkoutCard } from '../../src/features/trainer/client/workouts-tab';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';
import { makeBootstrap } from './gym-fixtures';
import { booking, BOOKING, coachStart, ION, MARIA } from './trainer-coach-fixtures';
import { settle } from './trainer-fixtures';

// The coached logger screen (trainer-mode.md §6.7): Start → one workout per client → THE workout
// logger with "Coaching Maria", client chips for a group, Finish "this one" / "everyone", back to
// the booking. Plus the mini bar, the no-routine state, starting offline, and the labels.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      dismissTo: jest.fn(),
      canGoBack: jest.fn(() => true),
      canDismiss: jest.fn(() => false),
    },
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
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
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; dismissTo: jest.Mock; back: jest.Mock };
}>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const TRAINER = 'trainer-1';

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  setGymOwner(TRAINER);
  resetRestTimerForTests();
  resetSnackbarForTests();
  coachedSessionStore.reload();
  coachedOutboxes.configure(null);
  coachedOutboxes.reload();
  ownerOutbox.configure(null);
  ownerOutbox.reload();
  activeSessionStore.clear();
  onlineManager.setOnline(true);
});

function handlers(overrides: Record<string, (input: unknown) => unknown> = {}) {
  return {
    'gym.bootstrap': () => makeBootstrap(),
    'trainer.bookings.get': () => booking(),
    'trainer.coach.start': (input: unknown) => {
      const { clientId } = input as { clientId: string };
      return clientId === MARIA ? coachStart(MARIA, 'Maria Pop') : coachStart(ION, 'Ion Rusu');
    },
    ...overrides,
  };
}

async function renderCoach(
  props: { bookingKey: string; clientId: string | null },
  h: ReturnType<typeof handlers> = handlers(),
) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
  const r = await renderWithTrpc(<CoachScreen {...props} />, h, queryClient);
  await settle(8);
  return r;
}

describe('coaching a group booking', () => {
  it('starts both clients, switches between them keeping each workout, then finishes everyone', async () => {
    const user = userEvent.setup();
    const r = await renderCoach({ bookingKey: BOOKING, clientId: null });

    // One coach.start per client, for this booking.
    const starts = r.calls.filter((c) => c.path === 'trainer.coach.start').map((c) => c.input);
    expect(starts).toEqual([
      expect.objectContaining({ clientId: MARIA, bookingId: BOOKING }),
      expect.objectContaining({ clientId: ION, bookingId: BOOKING }),
    ]);
    expect(track).toHaveBeenCalledWith('coached_workout_started', { group: true });

    // The logger, headed "Coaching Maria", with both clients' chips.
    expect(screen.getByText('Coaching Maria')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-client-0')).toHaveTextContent('Maria');
    expect(screen.getByTestId('coach-client-1')).toHaveTextContent('Ion');

    // Log Maria's first working set, switch to Ion: his workout is untouched.
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('coach-client-1'));
    expect(screen.getByText('Coaching Ion')).toBeOnTheScreen();
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0\/3 sets/);
    await user.press(screen.getByTestId('exercise-0-set-1-check'));

    // Back to Maria: her tick was kept.
    await user.press(screen.getByTestId('coach-client-0'));
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/1\/3 sets/);

    // Finish asks: this one or everyone.
    await user.press(screen.getByTestId('workout-finish'));
    expect(screen.getByTestId('coach-finish-this')).toHaveTextContent('Finish Maria’s workout');
    await user.press(screen.getByTestId('coach-finish-all'));

    expect(coachedSessionStore.all()).toHaveLength(0);
    expect(coachedOutboxes.forClient(MARIA).getState().entries).toHaveLength(1);
    expect(coachedOutboxes.forClient(ION).getState().entries).toHaveLength(1);
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/trainer/bookings/[id]',
      params: { id: BOOKING },
    });
  });

  it('"Finish Maria’s workout" moves on to Ion', async () => {
    const user = userEvent.setup();
    await renderCoach({ bookingKey: BOOKING, clientId: null });
    await user.press(screen.getByTestId('workout-finish'));
    await user.press(screen.getByTestId('coach-finish-this'));
    expect(screen.getByText('Coaching Ion')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-switcher')).toBeNull();
    expect(coachedSessionStore.find(BOOKING, MARIA)).toBeNull();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('re-opening does not restart a client whose workout is already queued', async () => {
    startCoachedWorkout(coachStart(MARIA, 'Maria Pop'), BOOKING, { order: 0, group: true });
    startCoachedWorkout(coachStart(ION, 'Ion Rusu'), BOOKING, { order: 1, group: true });
    finishCoachedWithDefaults(BOOKING, MARIA);
    const outcome = await startCoaching({
      bookingId: BOOKING,
      clientId: null,
      booking: booking(),
      online: true,
      today: '2026-10-19',
      fetchStart: () => Promise.reject(new Error('should not be asked')),
    });
    expect(outcome.started).toEqual([ION]);
    expect(coachedSessionStore.find(BOOKING, MARIA)).toBeNull();
  });
});

describe('one client, no booking', () => {
  it('"Log a workout for Maria": her next day, Finish goes back to her', async () => {
    const user = userEvent.setup();
    const r = await renderCoach({ bookingKey: 'none', clientId: MARIA });
    expect(r.calls.find((c) => c.path === 'trainer.coach.start')?.input).toEqual(
      expect.objectContaining({ clientId: MARIA }),
    );
    expect(r.calls.some((c) => c.path === 'trainer.bookings.get')).toBe(false);
    expect(screen.getByText('Coaching Maria')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-switcher')).toBeNull();
    expect(track).toHaveBeenCalledWith('coached_workout_started', { group: false });

    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('workout-finish'));
    // The logger's own finish sheet (sets unticked) — then back to Maria.
    await user.press(screen.getByTestId('workout-finish-sheet-confirm'));
    await settle();
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/trainer/[clientId]',
      params: { clientId: MARIA },
    });
    const queued = coachedOutboxes.forClient(MARIA).getState().entries[0]?.doc;
    expect(queued).toMatchObject({ status: 'COMPLETED', bookingId: null });
  });

  it('no routine: says so and links to her routine editor', async () => {
    const user = userEvent.setup();
    await renderCoach(
      { bookingKey: 'none', clientId: MARIA },
      handlers({ 'trainer.coach.start': () => coachStart(MARIA, 'Maria Pop', { workout: null }) }),
    );
    expect(screen.getByText('Maria has no routine yet.')).toBeOnTheScreen();
    await user.press(screen.getByTestId(`coach-no-routine-edit-${MARIA}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trainer/[clientId]/routine',
      params: { clientId: MARIA },
    });
  });
});

describe('offline', () => {
  it('starts from the prescription kept when Today loaded', async () => {
    savePrefetchedStart(BOOKING, MARIA, coachStart(MARIA, 'Maria Pop'), { order: 0 });
    savePrefetchedStart(BOOKING, ION, coachStart(ION, 'Ion Rusu'), { order: 1 });
    onlineManager.setOnline(false);
    const r = await renderCoach({ bookingKey: BOOKING, clientId: null });
    expect(r.calls.some((c) => c.path === 'trainer.coach.start')).toBe(false);
    expect(screen.getByTestId('coach-client-0')).toHaveTextContent('Maria');
    expect(screen.getByTestId('coach-client-1')).toHaveTextContent('Ion');
  });

  it('nothing kept and no connection: says starting needs a connection the first time', async () => {
    onlineManager.setOnline(false);
    await renderCoach({ bookingKey: 'none', clientId: MARIA });
    expect(screen.getByTestId('coach-needs-connection')).toBeOnTheScreen();
  });

  it('a client who left is skipped', async () => {
    const outcome = await startCoaching({
      bookingId: null,
      clientId: MARIA,
      booking: null,
      online: true,
      today: '2026-10-19',
      fetchStart: () => Promise.reject(trpcError('NOT_FOUND', 404)),
    });
    expect(outcome).toMatchObject({ unavailable: [MARIA], started: [] });
  });
});

describe('mini bar and entry points', () => {
  it('a coached workout in progress reads "Coaching Maria + 1" and opens the coached logger', async () => {
    const user = userEvent.setup();
    await renderCoach({ bookingKey: BOOKING, clientId: null });
    await render(<WorkoutMiniBar />);
    expect(screen.getByTestId('coached-mini-bar')).toHaveTextContent(/Coaching Maria \+ 1/);
    // The trainer's own bar stays away while they have no workout of their own.
    expect(screen.queryByTestId('workout-mini-bar')).toBeNull();
    await user.press(screen.getByTestId('coached-mini-bar'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trainer/coach/[bookingId]',
      params: { bookingId: BOOKING, clientId: MARIA },
    });
  });

  it('client detail: "Log a workout for Maria" opens the logger without a booking', async () => {
    const user = userEvent.setup();
    await render(<LogCoachedWorkoutButton clientId={MARIA} firstName="Maria" />);
    expect(screen.getByTestId('trainer-client-log-workout')).toHaveTextContent(
      'Log a workout for Maria',
    );
    await user.press(screen.getByTestId('trainer-client-log-workout'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trainer/coach/[bookingId]',
      params: { bookingId: 'none', clientId: MARIA },
    });
  });

  it('the trainer’s client Workouts tab labels a coached workout "Logged by you"', async () => {
    const workout = (overrides: Partial<CoachedWorkoutDto>): CoachedWorkoutDto => ({
      id: 'w1',
      name: 'Lower body A',
      localDate: '2026-10-19',
      startedAt: '2026-10-19T18:00:00.000Z',
      finishedAt: '2026-10-19T19:00:00.000Z',
      durationMin: 60,
      isDeload: false,
      exercises: [],
      ...overrides,
    });
    await render(
      <WorkoutCard workout={workout({ loggedByTrainer: true })} onOpenHistory={jest.fn()} />,
    );
    expect(screen.getByTestId('trainer-workout-w1-logged-by')).toHaveTextContent('Logged by you');
    await render(<WorkoutCard workout={workout({})} onOpenHistory={jest.fn()} />);
    expect(screen.queryByTestId('trainer-workout-w1-logged-by')).toBeNull();
  });
});
