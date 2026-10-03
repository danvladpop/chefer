import { onlineManager } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import type { GymBootstrap, SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import {
  addDaysLocal,
  sessionDurationMin,
  toSessionSummary,
  weekdayDateLabel,
} from '@chefer/utils';
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
import {
  EditSessionScreen,
  LogSessionScreen,
} from '../../src/features/gym/workout/edit-session-screen';
import {
  editDraftTarget,
  loadSessionDraft,
  logDraftTarget,
} from '../../src/features/gym/workout/session-draft-store';
import { makeBootstrap, makeDoc, makeExercise } from './gym-fixtures';
import {
  activeDoc,
  Providers,
  recordingLink,
  suggestion,
  supersetRoutine,
  testQueryClient,
  type LinkCall,
} from './gym-workout-helpers';

// UX-44 (T-44.3): edit mode over a past session. AC3 (the live store is never
// touched, edits save through the outbox), AC5 (Replace never touches the
// routine), AC6 (the date never lands in the future).

// UX-GYM-26: leaving is guarded by `useUnsavedGuard` (React Navigation's
// `usePreventRemove`). The mock records the latest (prevent, callback) pair —
// `prevent === true` is what also disables the iOS swipe — and `router.back()`
// behaves like the navigator: while prevented it reports the blocked action to
// the callback instead of leaving.
type PreventCallback = (options: { data: { action: unknown } }) => void;
const mockPrevent: { value: boolean; callback: PreventCallback | null } = {
  value: false,
  callback: null,
};
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
const BACK_ACTION = { type: 'GO_BACK' };
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(() => {
      if (mockPrevent.value) mockPrevent.callback?.({ data: { action: BACK_ACTION } });
    }),
    push: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventCallback) => {
    mockPrevent.value = prevent;
    mockPrevent.callback = callback;
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
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockDispatch.mockClear();
  mockGoBack.mockClear();
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

  it('UX-GYM-01: a PARKED (server-rejected) workout opens for editing, and saving the fix un-parks it', async () => {
    const user = userEvent.setup();
    const typo = pastDoc();
    const [first] = typo.exercises;
    if (!first) throw new Error('expected an exercise');
    const parkedDoc = {
      ...typo,
      exercises: [
        {
          ...first,
          sets: first.sets.map((set, i) => (i === 1 ? { ...set, weightKg: 1025 } : set)),
        },
      ],
    };
    // Park it the way a rejected upload does (sender first: enqueue kicks a flush).
    outbox.configure({
      send: jest.fn(() =>
        Promise.resolve([{ id: parkedDoc.id, status: 'rejected' as const, reason: 'bad' }]),
      ),
    });
    outbox.enqueue(parkedDoc, { ownerId: 'user-a' });
    await outbox.flush({ force: true });
    outbox.configure(null);
    expect(outbox.getState().entries[0]?.parkedReason).toBeDefined();

    await renderEdit(parkedDoc);
    expect(await screen.findByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(/1025/);
    await user.press(screen.getByTestId('exercise-0-set-2-weight-value'));
    for (const key of ['1', '0', '2', 'dot', '5']) {
      await user.press(screen.getByTestId(`number-sheet-key-${key}`));
    }
    await user.press(screen.getByTestId('number-sheet-save'));
    await user.press(screen.getByTestId('edit-session-save'));

    const [entry] = outbox.getState().entries;
    expect(entry?.parkedReason).toBeUndefined();
    expect(entry?.doc.exercises[0]?.sets[1]?.weightKg).toBe(102.5);
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

  it('AC6 + owner dogfood 2026-09-30: Change is a date stepper and a duration — never into the future', async () => {
    const user = userEvent.setup();
    await renderEdit(pastDoc());
    expect(await screen.findByTestId('edit-session-subtitle')).toHaveTextContent(/45 min/);
    await user.press(screen.getByTestId('edit-session-change-when'));
    expect(await screen.findByTestId('edit-session-when-date')).toHaveTextContent(
      weekdayDateLabel(SESSION_DAY),
    );
    // No clock time any more.
    expect(screen.queryByTestId('edit-session-when-time')).toBeNull();

    // Two days ago → yesterday → today, and no further.
    await user.press(screen.getByTestId('edit-session-when-date-next'));
    expect(screen.getByTestId('edit-session-when-date')).toHaveTextContent(/Yesterday/);
    await user.press(screen.getByTestId('edit-session-when-date-next'));
    expect(screen.getByTestId('edit-session-when-date')).toHaveTextContent(/Today/);
    expect(screen.getByTestId('edit-session-when-date-next')).toBeDisabled();
    await user.press(screen.getByTestId('edit-session-when-date-prev'));

    await fireEvent.changeText(screen.getByTestId('edit-session-when-duration'), '70');
    await user.press(screen.getByTestId('edit-session-when-done'));
    await user.press(screen.getByTestId('edit-session-save'));

    const saved = outbox.getState().entries[0]?.doc;
    const yesterday = addDaysLocal(TODAY, -1);
    expect(saved?.localDate).toBe(yesterday);
    expect(sessionDurationMin(saved ?? pastDoc())).toBe(70);
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
    // Discard replays the held navigation; nothing was sent.
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
    expect(outbox.getState().entries).toHaveLength(0);
  });

  // WP-03 lane C (UX-GYM-26): the leave guard + crash-safe drafts.
  describe('unsaved edits (UX-GYM-26)', () => {
    it('holds the iOS swipe only while there are edits', async () => {
      const user = userEvent.setup();
      await renderEdit(pastDoc());
      await screen.findByTestId('edit-session-title');
      expect(mockPrevent.value).toBe(false);
      await fixTheTypo(user);
      expect(mockPrevent.value).toBe(true);
    });

    it('a system back (Android BACK / swipe) with edits asks, and "Keep editing" keeps them', async () => {
      const user = userEvent.setup();
      await renderEdit(pastDoc());
      await fixTheTypo(user);
      await act(() => {
        mockPrevent.callback?.({ data: { action: BACK_ACTION } });
      });
      expect(await screen.findByText('Discard your edits?')).toBeOnTheScreen();
      await user.press(screen.getByTestId('edit-session-discard-sheet-cancel'));
      expect(screen.getByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(/^60kg$/);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('saving leaves without asking and forgets the draft', async () => {
      const user = userEvent.setup();
      const doc = pastDoc();
      await renderEdit(doc);
      await fixTheTypo(user);
      expect(loadSessionDraft('edit', editDraftTarget(doc.id))).not.toBeNull();
      await user.press(screen.getByTestId('edit-session-save'));
      expect(await screen.findByText('Workout updated')).toBeOnTheScreen();
      expect(screen.queryByText('Discard your edits?')).toBeNull();
      expect(router.back).toHaveBeenCalled();
      // The guard was released in the same tick as the navigation: no confirm,
      // and the held action is replayed once React has lifted the guard.
      expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
      expect(loadSessionDraft('edit', editDraftTarget(doc.id))).toBeNull();
    });

    it('a crash mid-edit loses nothing: re-opening brings the edits back, still unsaved', async () => {
      const user = userEvent.setup();
      const doc = pastDoc();
      await renderEdit(doc);
      await fixTheTypo(user);
      expect(loadSessionDraft('edit', editDraftTarget(doc.id))).not.toBeNull();
      // "Crash": the screen goes away without Save or Discard.
      await cleanup();

      await renderEdit(doc);
      expect(await screen.findByText('Restored your unsaved changes.')).toBeOnTheScreen();
      expect(screen.getByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(/^60kg$/);
      expect(mockPrevent.value).toBe(true);
    });

    it('Discard forgets the draft; the next open starts from the saved session', async () => {
      const user = userEvent.setup();
      const doc = pastDoc();
      await renderEdit(doc);
      await fixTheTypo(user);
      await user.press(screen.getByTestId('edit-session-cancel'));
      await user.press(await screen.findByTestId('edit-session-discard-sheet-confirm'));
      expect(loadSessionDraft('edit', editDraftTarget(doc.id))).toBeNull();
    });

    it('ignores a draft older than the session it was made from', async () => {
      const user = userEvent.setup();
      const doc = pastDoc();
      await renderEdit(doc);
      await fixTheTypo(user);
      await cleanup();
      // The session synced a newer version in the meantime.
      const newer = { ...doc, clientUpdatedAt: new Date(Date.now() + 1000).toISOString() };
      await renderEdit(newer);
      expect(await screen.findByTestId('exercise-0-set-2-weight-value')).toHaveTextContent(
        /^600kg$/,
      );
      expect(screen.queryByText('Restored your unsaved changes.')).toBeNull();
    });
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

// Owner dogfood 2026-09-30: "Log a workout you already did" opens log mode —
// a NEW past workout with no timer and no ticks, saved with Save.
describe('LogSessionScreen', () => {
  const YESTERDAY = addDaysLocal(TODAY, -1);

  async function renderLog(dayId: string | null) {
    const bootstrap = makeBootstrap({
      activeRoutine: supersetRoutine(),
      library: [makeExercise('bench'), makeExercise('squat'), makeExercise('row')],
    });
    const queryClient = testQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await render(
      <Providers
        queryClient={queryClient}
        bootstrap={bootstrap}
        link={recordingLink([], (path) => (path === 'profile.flags' ? {} : bootstrap))}
      >
        <LogSessionScreen date={YESTERDAY} dayId={dayId} />
        <Snackbar />
      </Providers>,
    );
  }

  it('opens the routine day as a new workout — working sets, no ✓, no timer — and Save logs every set', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    expect(await screen.findByTestId('edit-session-title')).toHaveTextContent('Log workout');
    expect(await screen.findByTestId('exercise-0-set-1-weight-value')).toBeOnTheScreen();
    expect(screen.queryByTestId('exercise-0-set-1-check')).toBeNull();
    expect(screen.queryByTestId('rest-timer')).toBeNull();
    expect(screen.getByTestId('edit-session-when-date')).toHaveTextContent(/Yesterday/);

    // ✕ on set 3 of the first exercise: it's left out of the log.
    await user.press(screen.getByTestId('exercise-0-set-3-menu'));
    await user.press(screen.getByTestId('edit-session-save'));

    const saved = outbox.getState().entries[0]?.doc;
    expect(saved?.status).toBe('COMPLETED');
    expect(saved?.localDate).toBe(YESTERDAY);
    expect(saved?.routineDayId).toBe('day-1');
    expect(saved?.exercises.map((e) => e.sets.length)).toEqual([2, 3, 3]);
    expect(saved?.exercises.flatMap((e) => e.sets).every((x) => x.completedAt !== null)).toBe(true);
    expect(saved?.exercises.flatMap((e) => e.sets).some((x) => x.isWarmup)).toBe(false);
    expect(activeSessionStore.get()).toBeNull();
    expect(router.back).toHaveBeenCalled();
  });

  it('sets the date and duration inline, never past today', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    await user.press(await screen.findByTestId('edit-session-when-date-next'));
    expect(screen.getByTestId('edit-session-when-date')).toHaveTextContent(/Today/);
    expect(screen.getByTestId('edit-session-when-date-next')).toBeDisabled();
    await user.press(screen.getByTestId('edit-session-when-date-prev'));
    await user.press(screen.getByTestId('edit-session-when-date-prev'));
    await fireEvent.changeText(screen.getByTestId('edit-session-when-duration'), '50');
    await user.press(screen.getByTestId('edit-session-save'));

    const saved = outbox.getState().entries[0]?.doc;
    expect(saved?.localDate).toBe(addDaysLocal(TODAY, -2));
    expect(sessionDurationMin(saved ?? pastDoc())).toBe(50);
  });

  it('a weight change carries to the later sets that still matched (log mode only)', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    // The value's accessibility label reads e.g. "Weight 60 kg, tap to type".
    const label = (id: string): string =>
      String(screen.getByTestId(id).props.accessibilityLabel ?? '');
    await screen.findByTestId('exercise-0-set-1-weight-value');
    const start = label('exercise-0-set-1-weight-value');
    await user.press(screen.getByTestId('exercise-0-set-1-weight-inc'));
    const after = label('exercise-0-set-1-weight-value');
    expect(after).not.toBe(start);
    expect(label('exercise-0-set-2-weight-value')).toBe(after);
    expect(label('exercise-0-set-3-weight-value')).toBe(after);
  });

  // WP-03 lane C (UX-GYM-26): log mode is guarded and crash-safe per day.
  it('holds the swipe once the log is edited, and a crash brings the log back', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    await screen.findByTestId('exercise-0-set-1-weight-value');
    expect(mockPrevent.value).toBe(false);
    expect(loadSessionDraft('log', logDraftTarget(YESTERDAY, 'day-1'))).toBeNull();

    await user.press(screen.getByTestId('exercise-0-set-1-weight-inc'));
    expect(mockPrevent.value).toBe(true);
    const label = (id: string): string =>
      String(screen.getByTestId(id).props.accessibilityLabel ?? '');
    const edited = label('exercise-0-set-1-weight-value');
    expect(loadSessionDraft('log', logDraftTarget(YESTERDAY, 'day-1'))).not.toBeNull();

    await cleanup();
    await renderLog('day-1');
    expect(await screen.findByText('Restored your unsaved changes.')).toBeOnTheScreen();
    expect(label('exercise-0-set-1-weight-value')).toBe(edited);
    expect(mockPrevent.value).toBe(true);
  });

  it('Back with an edited log asks "Discard this workout?"; Discard forgets the draft', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    await user.press(await screen.findByTestId('exercise-0-set-1-weight-inc'));
    await user.press(screen.getByTestId('edit-session-cancel'));
    expect(await screen.findByText('Discard this workout?')).toBeOnTheScreen();
    await user.press(screen.getByTestId('edit-session-discard-sheet-confirm'));
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
    expect(loadSessionDraft('log', logDraftTarget(YESTERDAY, 'day-1'))).toBeNull();
  });

  it('saving a log forgets the draft and leaves without asking', async () => {
    const user = userEvent.setup();
    await renderLog('day-1');
    await user.press(await screen.findByTestId('exercise-0-set-1-weight-inc'));
    await user.press(screen.getByTestId('edit-session-save'));
    expect(outbox.getState().entries).toHaveLength(1);
    expect(loadSessionDraft('log', logDraftTarget(YESTERDAY, 'day-1'))).toBeNull();
    expect(screen.queryByText('Discard this workout?')).toBeNull();
    // Released in the same tick as the navigation: the held action is replayed.
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
  });

  it('an empty freestyle log is not saved', async () => {
    const user = userEvent.setup();
    await renderLog(null);
    expect(await screen.findByTestId('edit-session-subtitle')).toHaveTextContent(
      'Freestyle workout',
    );
    await user.press(screen.getByTestId('edit-session-save'));
    expect(await screen.findByTestId('snackbar-message')).toHaveTextContent(/at least one/);
    expect(outbox.getState().entries).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
  });
});
