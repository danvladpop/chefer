import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { getRestTimer, resetRestTimerForTests } from '../../src/features/gym/rest-timer';
import * as activeWorkout from '../../src/features/gym/use-active-workout';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { getFinished, resetFinishedForTests } from '../../src/features/gym/workout/finished-store';
import { WorkoutScreen } from '../../src/features/gym/workout/workout-screen';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import {
  activeDoc,
  machine,
  Providers,
  SE_ID,
  SET_IDS,
  suggestion,
  supersetDoc,
  supersetRoutine,
  testQueryClient,
  WARMUP_ID,
} from './gym-workout-helpers';

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

const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');
const haptics = jest.requireMock<{ impactAsync: jest.Mock; notificationAsync: jest.Mock }>(
  'expo-haptics',
);

function currentDoc(): WorkoutSessionDoc {
  const record = activeSessionStore.get();
  if (!record) throw new Error('no active session');
  return record.doc;
}

function workingSet(i: number) {
  const set = currentDoc().exercises[0]?.sets.find((s) => s.id === SET_IDS[i]);
  if (!set) throw new Error(`no set ${i}`);
  return set;
}

async function renderWorkout(doc: WorkoutSessionDoc, bootstrap: GymBootstrap = makeBootstrap()) {
  activeSessionStore.set(doc, 'user-a');
  const queryClient = testQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
  await render(
    <Providers queryClient={queryClient} bootstrap={bootstrap}>
      <WorkoutScreen />
    </Providers>,
  );
  return queryClient;
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetRestTimerForTests();
  resetFinishedForTests();
  outbox.reload();
  outbox.configure(null);
  activeSessionStore.clear();
  setGymOwner('user-a');
  router.replace.mockClear();
  haptics.impactAsync.mockClear();
  haptics.notificationAsync.mockClear();
});

describe('WorkoutScreen — set rows', () => {
  it('renders the header, the suggestion banner and prefilled set rows', async () => {
    await renderWorkout(activeDoc());
    expect(screen.getByTestId('workout-title')).toHaveTextContent('Upper A');
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0\/3 sets/);
    expect(screen.getByTestId('exercise-0-suggestion')).toHaveTextContent(
      'Starting weight: 60 kg. Aim for 10 reps.',
    );
    expect(screen.getByTestId('exercise-0-set-1-weight-value')).toHaveTextContent(/^60kg$/);
    expect(screen.getByTestId('exercise-0-set-1-reps-value')).toHaveTextContent(/^10reps$/);
    // Warm-ups are collapsed by default.
    expect(screen.queryByTestId('exercise-0-warmup-1')).toBeNull();
    expect(screen.getByTestId('exercise-0-warmups-toggle')).toHaveTextContent(/1 warm-up set/);
  });

  it('one tap on ✓ logs the prefilled values, starts the rest timer and buzzes', async () => {
    const user = userEvent.setup();
    const dispatch = jest.spyOn(activeWorkout, 'dispatchWorkout');
    await renderWorkout(activeDoc());

    await user.press(screen.getByTestId('exercise-0-set-1-check'));

    expect(dispatch).toHaveBeenCalledWith(
      {
        type: 'completeSet',
        seId: SE_ID,
        setId: SET_IDS[0],
        weightKg: 60,
        reps: 10,
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers are typed any
      expect.objectContaining({ supersets: expect.any(Map) }),
    );
    expect(workingSet(0).completedAt).not.toBeNull();
    expect(workingSet(0)).toMatchObject({ weightKg: 60, reps: 10 });
    expect(getRestTimer()).toMatchObject({ durationSec: 120, seId: SE_ID });
    expect(screen.getByTestId('rest-timer')).toBeOnTheScreen();
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/1\/3 sets/);
    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);

    // A second tap un-ticks it.
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(workingSet(0).completedAt).toBeNull();
    dispatch.mockRestore();
  });

  it('warm-up sets expand, tick, and never start the rest timer', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-warmups-toggle'));
    await user.press(screen.getByTestId('exercise-0-warmup-1-check'));
    expect(currentDoc().exercises[0]?.sets[0]?.completedAt).not.toBeNull();
    expect(getRestTimer()).toBeNull();
  });

  it('the barbell weight stepper walks achievable plate loads and carries to later sets', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());

    // Bar 20 + plate pairs down to 1.25 kg → 2.5 kg jumps.
    await user.press(screen.getByTestId('exercise-0-set-1-weight-inc'));
    expect(workingSet(0).weightKg).toBe(62.5);
    expect(workingSet(1).weightKg).toBe(62.5);
    expect(workingSet(2).weightKg).toBe(62.5);
    expect(screen.getByTestId('exercise-0-set-1-weight-value')).toHaveTextContent(/^62\.5kg$/);

    // Editing a later set only touches that set and the ones after it.
    await user.press(screen.getByTestId('exercise-0-set-3-weight-dec'));
    expect(workingSet(2).weightKg).toBe(60);
    expect(workingSet(1).weightKg).toBe(62.5);

    await user.press(screen.getByTestId('exercise-0-set-2-reps-inc'));
    expect(workingSet(1).reps).toBe(11);
  });

  it('a machine stepper uses the profile stack step and snaps odd weights onto it', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({ library: [machine()] });
    const doc = activeDoc({ exerciseId: 'chest-press' });
    await renderWorkout(doc, bootstrap);

    await user.press(screen.getByTestId('exercise-0-set-1-weight-inc'));
    expect(workingSet(0).weightKg).toBe(65); // machineStepKg = 5

    await user.press(screen.getByTestId('exercise-0-set-2-weight-dec'));
    await user.press(screen.getByTestId('exercise-0-set-2-weight-dec'));
    expect(workingSet(1).weightKg).toBe(55);
  });

  it('tapping a barbell weight opens the plate calculator', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-set-1-weight-value'));
    const calc = screen.getByTestId('plate-calculator');
    // 60 kg on a 20 kg bar → 20 per side.
    expect(within(calc).getByTestId('plate-0')).toHaveTextContent('20');

    await user.press(screen.getByTestId('number-sheet-key-7'));
    await user.press(screen.getByTestId('number-sheet-key-0'));
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent(/^70/);
    await user.press(screen.getByTestId('number-sheet-save'));
    expect(workingSet(0).weightKg).toBe(70);
  });
});

describe('WorkoutScreen — RIR chips', () => {
  it('appear only after the last working set is ticked, and record the answer', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());

    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('exercise-0-set-2-check'));
    expect(screen.queryByTestId('exercise-0-rir')).toBeNull();

    await user.press(screen.getByTestId('exercise-0-set-3-check'));
    expect(screen.getByTestId('exercise-0-rir')).toBeOnTheScreen();
    expect(screen.queryByTestId('exercise-0-rir-calibrating')).toBeNull();

    await user.press(screen.getByTestId('exercise-0-rir-2'));
    expect(currentDoc().exercises[0]?.lastSetRir).toBe(2);
    // Answering closes the finished exercise; reopening shows the answer.
    expect(screen.queryByTestId('exercise-0-rir')).toBeNull();
    await user.press(screen.getByTestId('exercise-0-header'));
    expect(screen.getByTestId('exercise-0-rir-summary')).toHaveTextContent(/: 2/);
  });

  it('are highlighted while the engine is calibrating', async () => {
    const user = userEvent.setup();
    await renderWorkout(
      activeDoc({ prescription: suggestion({ reasonCode: 'START_CALIBRATING' }) }),
    );
    for (const n of [1, 2, 3]) {
      await user.press(screen.getByTestId(`exercise-0-set-${n}-check`));
    }
    expect(screen.getByTestId('exercise-0-rir-calibrating')).toHaveTextContent(
      'Helps us find your weight',
    );
  });
});

describe('WorkoutScreen — live PRs', () => {
  it('badges at most one set per exercise when it beats the cached history', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({
      recentSessions: [
        {
          id: 'past',
          name: 'Upper A',
          routineDayId: null,
          status: 'COMPLETED',
          localDate: '2026-09-20',
          startedAt: '2026-09-20T08:00:00.000Z',
          finishedAt: '2026-09-20T09:00:00.000Z',
          isDeload: false,
          exercises: [
            {
              exerciseId: 'bench',
              skipped: false,
              lastSetRir: null,
              sets: [{ weightKg: 55, reps: 10, isWarmup: false, completed: true }],
            },
          ],
        },
      ],
    });
    await renderWorkout(activeDoc(), bootstrap);
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('exercise-0-set-2-check'));

    expect(screen.getByTestId('exercise-0-set-1-pr')).toHaveTextContent(/PR/);
    expect(screen.queryByTestId('exercise-0-set-2-pr')).toBeNull();
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});

describe('WorkoutScreen — finish', () => {
  it('asks before finishing with unticked sets; "Keep going" keeps the session', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-set-1-check'));

    await user.press(screen.getByTestId('workout-finish'));
    expect(screen.getByTestId('workout-finish-sheet-body')).toHaveTextContent(
      '2 sets aren’t ticked. Only ticked sets count.',
    );
    await user.press(screen.getByTestId('workout-finish-sheet-cancel'));
    expect(activeSessionStore.get()).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('"Finish anyway" queues the doc and opens the summary', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('workout-finish'));
    await user.press(screen.getByTestId('workout-finish-sheet-confirm'));

    const id = activeDoc().id;
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/gym/summary/[id]',
      params: { id },
    });
    expect(activeSessionStore.get()).toBeNull();
    expect(outbox.getState().entries.map((e) => [e.doc.id, e.doc.status])).toEqual([
      [id, 'COMPLETED'],
    ]);
    expect(getFinished(id)?.status).toBe('COMPLETED');
  });

  it('finishes straight away when every working set is ticked', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    for (const n of [1, 2, 3]) {
      await user.press(screen.getByTestId(`exercise-0-set-${n}-check`));
    }
    await user.press(screen.getByTestId('workout-finish'));
    expect(screen.queryByTestId('workout-finish-sheet-body')).toBeNull();
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/gym/summary/[id]' }),
    );
  });

  it('discard sits behind a destructive confirmation', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('workout-discard'));
    expect(activeSessionStore.get()).not.toBeNull();
    await user.press(screen.getByTestId('workout-discard-sheet-confirm'));
    expect(activeSessionStore.get()).toBeNull();
    expect(outbox.getState().entries[0]?.doc.status).toBe('DISCARDED');
  });
});

describe('WorkoutScreen — exercise menu', () => {
  it('skip marks the exercise skipped and it stops counting toward planned sets', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({ library: [makeExercise('bench', 'Bench Press')] });
    await renderWorkout(activeDoc(), bootstrap);
    await user.press(screen.getByTestId('exercise-0-menu'));
    await user.press(screen.getByTestId('menu-skip'));
    expect(currentDoc().exercises[0]?.skipped).toBe(true);
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0\/0 sets/);
    await user.press(screen.getByTestId('exercise-0-unskip'));
    expect(currentDoc().exercises[0]?.skipped).toBe(false);
  });

  it('"Update routine" on a swap is disabled with a reason when the exercise has no routine slot', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-menu'));
    await user.press(screen.getByTestId('menu-swap'));
    expect(screen.getByTestId('menu-swap-routine')).toBeDisabled();
    expect(screen.getByTestId('menu-swap-routine-blocked')).toHaveTextContent(/today only/);
  });
});

describe('WorkoutScreen — supersets', () => {
  const bootstrap = () => makeBootstrap({ activeRoutine: supersetRoutine() });

  it('brackets the superset and labels its rest', async () => {
    await renderWorkout(supersetDoc(), bootstrap());
    expect(screen.getByTestId('superset-A')).toHaveTextContent(
      /Superset A.*90 s rest after each round/,
    );
    expect(screen.getByTestId('exercise-0-superset')).toHaveTextContent('A1');
    expect(screen.getByTestId('exercise-1-superset')).toHaveTextContent('A2');
    expect(screen.queryByTestId('exercise-2-superset')).toBeNull();
    // Both members of the current superset are open.
    expect(screen.getByTestId('exercise-0-set-1-check')).toBeOnTheScreen();
    expect(screen.getByTestId('exercise-1-set-1-check')).toBeOnTheScreen();
    expect(screen.queryByTestId('exercise-2-set-1-check')).toBeNull();
  });

  it('A1 → A2 with no rest; the rest starts after the last exercise of the round', async () => {
    const user = userEvent.setup();
    await renderWorkout(supersetDoc(), bootstrap());

    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(getRestTimer()).toBeNull();

    await user.press(screen.getByTestId('exercise-1-set-1-check'));
    expect(getRestTimer()).toMatchObject({ durationSec: 90, seId: 'squat-se' });

    // Round 2 starts while resting: the rest is cleared, no new one until A2.
    await user.press(screen.getByTestId('exercise-0-set-2-check'));
    expect(getRestTimer()).toBeNull();
    await user.press(screen.getByTestId('exercise-1-set-2-check'));
    expect(getRestTimer()).toMatchObject({ durationSec: 90 });
  });

  it('without the routine grouping the same session rests after every set', async () => {
    const user = userEvent.setup();
    await renderWorkout(supersetDoc(), makeBootstrap());
    expect(screen.queryByTestId('superset-A')).toBeNull();
    await user.press(screen.getByTestId('exercise-0-set-1-check'));
    expect(getRestTimer()).toMatchObject({ durationSec: 120, seId: 'bench-se' });
  });
});

describe('WorkoutScreen — remove a set', () => {
  it('long-press a working set → confirm → removed, positions stay contiguous', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());

    await fireEvent(screen.getByTestId('exercise-0-set-2'), 'longPress');
    expect(screen.getByTestId('workout-remove-set-sheet-title')).toHaveTextContent('Remove set 2?');
    await user.press(screen.getByTestId('workout-remove-set-sheet-confirm'));

    const sets = currentDoc().exercises[0]?.sets ?? [];
    expect(sets.map((s) => s.id)).toEqual([WARMUP_ID, SET_IDS[0], SET_IDS[2]]);
    expect(sets.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(screen.getByTestId('workout-progress')).toHaveTextContent(/0\/2 sets/);
  });

  it('warm-ups can be removed too; "Keep it" changes nothing', async () => {
    const user = userEvent.setup();
    await renderWorkout(activeDoc());
    await user.press(screen.getByTestId('exercise-0-warmups-toggle'));

    await fireEvent(screen.getByTestId('exercise-0-warmup-1'), 'longPress');
    await user.press(screen.getByTestId('workout-remove-set-sheet-cancel'));
    expect(currentDoc().exercises[0]?.sets).toHaveLength(4);

    await fireEvent(screen.getByTestId('exercise-0-warmup-1'), 'longPress');
    expect(screen.getByTestId('workout-remove-set-sheet-title')).toHaveTextContent(
      'Remove warm-up 1?',
    );
    await user.press(screen.getByTestId('workout-remove-set-sheet-confirm'));
    const sets = currentDoc().exercises[0]?.sets ?? [];
    expect(sets.map((s) => s.id)).toEqual([...SET_IDS]);
    expect(sets.map((s) => s.position)).toEqual([0, 1, 2]);
  });
});
