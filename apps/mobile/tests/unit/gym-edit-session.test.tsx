import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymBootstrap, SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { addDaysLocal, toSessionSummary } from '@chefer/utils';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import {
  resetSessionCorrectionsForTests,
  sessionGetQueryKey,
} from '../../src/features/gym/offline/session-corrections';
import * as activeWorkout from '../../src/features/gym/use-active-workout';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { EditSessionScreen } from '../../src/features/gym/workout/edit-session-screen';
import { makeBootstrap, makeDoc, makeExercise } from './gym-fixtures';
import {
  activeDoc,
  Providers,
  recordingLink,
  suggestion,
  testQueryClient,
  type LinkCall,
} from './gym-workout-helpers';

// UX-44 (T-44.3): edit mode over a past session. AC3 (the live store is never
// touched, edits save through the outbox), AC5 (Replace never touches the
// routine), AC6 (the date never lands in the future).

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    push: jest.fn(),
    canGoBack: jest.fn(() => true),
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
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');

const TODAY = localDate();
const SESSION_DAY = addDaysLocal(TODAY, -2);
const SET = [
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
] as const;
const SE = '00000000-0000-4000-8000-0000000000b1';

/** Tuesday's session: bench 60 kg then the 600 kg typo. */
function pastDoc(): WorkoutSessionDoc {
  const started = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  return makeDoc(1, {
    name: 'Full Body A',
    localDate: SESSION_DAY,
    startedAt: started,
    finishedAt: new Date(Date.parse(started) + 45 * 60_000).toISOString(),
    clientUpdatedAt: new Date(Date.parse(started) + 45 * 60_000).toISOString(),
    exercises: [
      {
        id: SE,
        exerciseId: 'bench',
        routineExerciseId: 're-1',
        position: 0,
        repMin: 6,
        repMax: 10,
        targetRir: 2,
        restSec: 120,
        skipped: false,
        swappedFromId: null,
        lastSetRir: 2,
        notes: null,
        prescription: suggestion(),
        sets: [
          {
            id: SET[0],
            position: 0,
            weightKg: 60,
            reps: 8,
            isWarmup: false,
            completedAt: started,
          },
          {
            id: SET[1],
            position: 1,
            weightKg: 600,
            reps: 8,
            isWarmup: false,
            completedAt: started,
          },
        ],
      },
    ],
  });
}

function bootstrapWith(doc: WorkoutSessionDoc): GymBootstrap {
  return makeBootstrap({
    library: [makeExercise('bench', 'Bench Press'), makeExercise('incline', 'Incline Press')],
    recentSessions: [toSessionSummary(doc)] as SessionSummaryDto[],
    weeks: [],
  });
}

async function renderEdit(
  doc: WorkoutSessionDoc,
  calls: LinkCall[] = [],
  opts: { cached?: boolean } = {},
) {
  const bootstrap = bootstrapWith(doc);
  const queryClient = testQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
  // A session opened before is in the persisted gym cache: it opens again offline.
  if (opts.cached) queryClient.setQueryData(sessionGetQueryKey(doc.id), doc);
  await render(
    <Providers
      queryClient={queryClient}
      bootstrap={bootstrap}
      link={recordingLink(calls, (path) => {
        if (path === 'gym.session.get') return doc;
        if (path === 'profile.flags') return {};
        return bootstrap;
      })}
    >
      <EditSessionScreen sessionId={doc.id} />
      <Snackbar />
    </Providers>,
  );
  return queryClient;
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetSnackbarForTests();
  resetSessionCorrectionsForTests();
  outbox.reload();
  outbox.configure(null);
  activeSessionStore.clear();
  setGymOwner('user-a');
  onlineManager.setOnline(true);
  router.back.mockClear();
});

async function fixTheTypo(user: ReturnType<typeof userEvent.setup>) {
  await user.press(await screen.findByTestId('exercise-0-set-2-weight-value'));
  await user.press(screen.getByTestId('number-sheet-key-6'));
  await user.press(screen.getByTestId('number-sheet-key-0'));
  await user.press(screen.getByTestId('number-sheet-save'));
}

describe('EditSessionScreen', () => {
  it('opens a completed session as editable sets, with no clock, rest timer or Why? banner', async () => {
    await renderEdit(pastDoc());
    expect(await screen.findByTestId('edit-session-title')).toHaveTextContent(/^Editing · /);
    expect(screen.getByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(/^600kg$/);
    expect(screen.queryByTestId('workout-elapsed')).toBeNull();
    expect(screen.queryByTestId('rest-timer')).toBeNull();
    expect(screen.queryByTestId('exercise-0-suggestion')).toBeNull();
    expect(screen.queryByTestId('exercise-0-why')).toBeNull();
  });

  it('AC3: fixing 600 → 60 and saving queues the doc with a newer clientUpdatedAt and never touches the live store', async () => {
    const user = userEvent.setup();
    // A workout is running elsewhere: edit mode must leave its store alone.
    activeSessionStore.set(activeDoc(), 'user-a');
    const liveBefore = JSON.stringify(activeSessionStore.get());
    const dispatch = jest.spyOn(activeWorkout, 'dispatchWorkout');
    const original = pastDoc();
    await renderEdit(original);

    await fixTheTypo(user);
    expect(screen.getByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(/^60kg$/);
    await user.press(screen.getByTestId('edit-session-save'));

    const [entry] = outbox.getState().entries;
    expect(outbox.getState().entries).toHaveLength(1);
    expect(entry?.doc.id).toBe(original.id);
    expect(entry?.doc.status).toBe('COMPLETED');
    expect(entry?.doc.exercises[0]?.sets[1]?.weightKg).toBe(60);
    expect(Date.parse(entry?.doc.clientUpdatedAt ?? '')).toBeGreaterThan(
      Date.parse(original.clientUpdatedAt),
    );
    expect(await screen.findByText('Workout updated')).toBeOnTheScreen();
    expect(router.back).toHaveBeenCalled();

    expect(dispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(activeSessionStore.get())).toBe(liveBefore);
    dispatch.mockRestore();
  });

  it('saves offline: the edit waits in the outbox (nothing is sent) when there is no connection', async () => {
    const user = userEvent.setup();
    const send = jest.fn(() => Promise.resolve([]));
    outbox.configure({ send });
    onlineManager.setOnline(false);
    await renderEdit(pastDoc(), [], { cached: true });
    await fixTheTypo(user);
    await user.press(screen.getByTestId('edit-session-save'));
    expect(outbox.getState().entries).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('AC5: Replace exercise goes straight to the picker, never offers the routine, and changes this workout only', async () => {
    const user = userEvent.setup();
    const calls: LinkCall[] = [];
    await renderEdit(pastDoc(), calls);

    await user.press(await screen.findByTestId('exercise-0-menu'));
    expect(screen.getByTestId('menu-replace')).toBeOnTheScreen();
    expect(screen.queryByTestId('menu-swap')).toBeNull();
    expect(screen.queryByText('Today and my routine')).toBeNull();
    await user.press(screen.getByTestId('menu-replace'));

    await waitFor(() => expect(screen.getByTestId('edit-session-picker')).toBeOnTheScreen());
    await user.press(await screen.findByText('Incline Press'));

    // The logged numbers moved to the new exercise.
    expect(await screen.findByTestId('exercise-0-name')).toHaveTextContent('Incline Press');
    expect(screen.getByTestId('exercise-0-set-1-weight-value')).toHaveTextContent(/^60kg$/);

    await user.press(screen.getByTestId('edit-session-save'));
    const saved = outbox.getState().entries[0]?.doc;
    expect(saved?.exercises[0]).toMatchObject({
      exerciseId: 'incline',
      swappedFromId: 'bench',
      routineExerciseId: 're-1',
    });
    expect(calls.some((c) => c.path.startsWith('gym.routine'))).toBe(false);
  });

  it('AC6: the date chips run from last Monday to today, never into the future', async () => {
    const user = userEvent.setup();
    await renderEdit(pastDoc());
    await user.press(await screen.findByTestId('edit-session-change-when'));
    expect(await screen.findByTestId(`edit-session-when-date-${TODAY}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`edit-session-when-date-${addDaysLocal(TODAY, 1)}`)).toBeNull();
    expect(screen.getByTestId(`edit-session-when-date-${SESSION_DAY}`)).toBeOnTheScreen();

    // Move it to yesterday and save: the doc lands on that day, not after "now".
    const yesterday = addDaysLocal(TODAY, -1);
    await user.press(screen.getByTestId(`edit-session-when-date-${yesterday}`));
    await user.press(screen.getByTestId('edit-session-when-done'));
    await user.press(screen.getByTestId('edit-session-save'));
    const saved = outbox.getState().entries[0]?.doc;
    expect(saved?.localDate).toBe(yesterday);
    expect(Date.parse(saved?.startedAt ?? '')).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(saved?.finishedAt ?? '')).toBeLessThanOrEqual(Date.now());
  });

  it('Cancel with edits asks first; Discard leaves without sending anything', async () => {
    const user = userEvent.setup();
    await renderEdit(pastDoc());
    await fixTheTypo(user);
    await user.press(screen.getByTestId('edit-session-cancel'));
    expect(await screen.findByText('Discard your edits?')).toBeOnTheScreen();
    expect(screen.getByText('Your workout stays as it was.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('edit-session-discard-sheet-confirm'));
    expect(router.back).toHaveBeenCalled();
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it('Cancel with no edits just leaves', async () => {
    const user = userEvent.setup();
    await renderEdit(pastDoc());
    await user.press(await screen.findByTestId('edit-session-cancel'));
    expect(router.back).toHaveBeenCalled();
    expect(screen.queryByText('Discard your edits?')).toBeNull();
  });

  it('un-ticking every set and saving asks to delete instead of saving an empty workout', async () => {
    const user = userEvent.setup();
    await renderEdit(pastDoc());
    await user.press(await screen.findByTestId('exercise-0-set-1-check'));
    await user.press(screen.getByTestId('exercise-0-set-2-check'));
    await user.press(screen.getByTestId('edit-session-save'));
    expect(await screen.findByText('Nothing is ticked. Delete this workout?')).toBeOnTheScreen();
    expect(outbox.getState().entries).toHaveLength(0);
    await user.press(screen.getByTestId('edit-session-nothing-sheet-cancel'));
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it('a session that was never loaded needs a connection', async () => {
    onlineManager.setOnline(false);
    const doc = pastDoc();
    await render(
      <Providers queryClient={testQueryClient()}>
        <EditSessionScreen sessionId={doc.id} />
      </Providers>,
    );
    expect(await screen.findByTestId('edit-session-unavailable')).toBeOnTheScreen();
    expect(screen.getByText('Connect to load older workouts.')).toBeOnTheScreen();
  });
});
