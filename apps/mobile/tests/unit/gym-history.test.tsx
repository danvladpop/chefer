import { Alert } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { weekStartOf } from '@chefer/utils';
import { SessionDetailScreen } from '../../src/features/gym/history/session-detail-screen';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import { resetSessionCorrectionsForTests } from '../../src/features/gym/offline/session-corrections';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise, uuid } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

const session: SessionSummaryDto = {
  id: 'session-1',
  name: 'Push Day',
  routineDayId: null,
  status: 'COMPLETED',
  localDate: '2026-09-10',
  startedAt: '2026-09-10T08:00:00.000Z',
  finishedAt: '2026-09-10T08:45:00.000Z',
  isDeload: false,
  exercises: [
    {
      exerciseId: 'bench',
      skipped: false,
      lastSetRir: 2,
      sets: [
        { weightKg: 40, reps: 10, isWarmup: true, completed: true },
        { weightKg: 60, reps: 8, isWarmup: false, completed: true },
        { weightKg: 60, reps: 6, isWarmup: false, completed: false },
      ],
    },
  ],
};

beforeEach(() => {
  onlineManager.setOnline(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe('SessionDetailScreen', () => {
  it('renders offline from the cached bootstrap summary', async () => {
    const bootstrap = makeBootstrap({
      library: [makeExercise('bench', 'Bench Press')],
      recentSessions: [session],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    expect(await screen.findByTestId('gym-session-detail')).toBeTruthy();
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText(/not done/)).toBeTruthy();
    expect(screen.getByText('RIR: 2')).toBeTruthy();
  });

  // WP-20: "Cycling class · 45 min · ~400 kcal (from your watch)".
  it('reads a quick-logged activity as one line with the kcal source, with or without the library row', async () => {
    const activity: SessionSummaryDto = {
      ...session,
      id: 'activity-1',
      name: 'Cycling class',
      startedAt: '2026-09-10T17:00:00.000Z',
      finishedAt: '2026-09-10T17:45:00.000Z',
      exercises: [
        {
          exerciseId: 'spin-class',
          skipped: false,
          lastSetRir: null,
          sets: [
            {
              weightKg: 0,
              reps: 0,
              isWarmup: false,
              completed: true,
              durationSec: 2700,
              intensityRpe: 7,
              caloriesKcal: 400,
            },
          ],
        },
      ],
    };
    // No `spin-class` in the cached library (an older cache): still a clean line, never "0 kg × 0".
    const bootstrap = makeBootstrap({ recentSessions: [activity] });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="activity-1" />, queryClient);

    await screen.findByTestId('gym-session-detail');
    expect(screen.getByTestId('session-detail-activity')).toBeTruthy();
    expect(screen.getByText('Cycling class · 45 min · ~400 kcal (from your watch)')).toBeTruthy();
    expect(screen.getByText('Effort: Hard')).toBeTruthy();
    expect(screen.queryByText(/kg/)).toBeNull();
  });

  it('bug B-41: working sets are numbered from 1, independent of preceding warm-ups', async () => {
    const bootstrap = makeBootstrap({
      library: [makeExercise('bench', 'Bench Press')],
      recentSessions: [session],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    await screen.findByTestId('gym-session-detail');
    // Fixture: 1 warm-up, then 2 working sets — the buggy numbering used to
    // read "Warm-up", "Set 2", "Set 3" (counting the warm-up's own position).
    expect(screen.getByText('Warm-up 1')).toBeTruthy();
    expect(screen.getByText('Set 1')).toBeTruthy();
    expect(screen.getByText('Set 2')).toBeTruthy();
    expect(screen.queryByText('Set 3')).toBeNull();
  });

  // UX-GYM-27 / UX-GYM-34: bodyweight and assisted loads read right, the date is
  // not an ISO string, and a lift that appears twice does not clash on its key.
  it('formats bodyweight/assisted loads with the exercise load type and shows an Intl date', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const bootstrap = makeBootstrap({
      library: [
        { ...makeExercise('dip', 'Dip'), loadType: 'BODYWEIGHT_PLUS' },
        { ...makeExercise('pullup', 'Assisted Pull-up'), loadType: 'ASSISTED' },
        { ...makeExercise('pushup', 'Push-up'), loadType: 'BODYWEIGHT' },
      ],
      recentSessions: [
        {
          ...session,
          exercises: [
            {
              exerciseId: 'pushup',
              skipped: false,
              lastSetRir: null,
              sets: [{ weightKg: 0, reps: 12, isWarmup: false, completed: true }],
            },
            {
              exerciseId: 'pullup',
              skipped: false,
              lastSetRir: null,
              sets: [{ weightKg: 25, reps: 8, isWarmup: false, completed: true }],
            },
            {
              exerciseId: 'dip',
              skipped: false,
              lastSetRir: null,
              sets: [{ weightKg: 10, reps: 6, isWarmup: false, completed: true }],
            },
            // The same lift twice in one session (two entries) — duplicate keys before.
            {
              exerciseId: 'dip',
              skipped: false,
              lastSetRir: null,
              sets: [{ weightKg: 0, reps: 5, isWarmup: false, completed: true }],
            },
          ],
        },
      ],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    await screen.findByTestId('gym-session-detail');
    expect(screen.getByText(/BW × 12/)).toBeTruthy();
    expect(screen.getByText(/25 kg assist × 8/)).toBeTruthy();
    expect(screen.getByText(/BW \+ 10 kg × 6/)).toBeTruthy();
    expect(screen.queryByText(/0 kg × 12/)).toBeNull();
    // "Sep 10, 2026" (device locale), never the ISO "2026-09-10".
    expect(screen.queryByText(/2026-09-10/)).toBeNull();
    expect(screen.getByText(/Sep.*10.*2026|10.*Sep.*2026/)).toBeTruthy();
    const keyWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
  });

  it('shows a not-found state offline for an unknown session', async () => {
    const bootstrap = makeBootstrap({ recentSessions: [] });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="missing" />, queryClient);

    const empty = await screen.findByTestId('session-detail-not-found');
    expect(empty).toBeTruthy();
    expect(screen.getByText('Connect to load it.')).toBeTruthy();
  });

  // ── UX-44 (T-44.1/T-44.2): edit + delete from the detail header ───────────
  it('AC1/AC7: the header offers Edit and a ⋯ menu — and no native Alert anywhere', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({
      library: [makeExercise('bench')],
      recentSessions: [session],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    expect(screen.queryByTestId('session-detail-delete')).toBeNull();
    await user.press(await screen.findByTestId('session-detail-edit'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/workout',
      params: { edit: 'session-1' },
    });

    await user.press(screen.getByTestId('session-detail-options'));
    expect(await screen.findByTestId('session-detail-menu-edit')).toBeOnTheScreen();
    expect(screen.getByTestId('session-detail-menu-delete')).toBeOnTheScreen();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  describe('delete with Undo', () => {
    // A real UUID: the outbox validates docs against the session schema before sending.
    const DELETE_ID = uuid(9);
    const onDay = (over: Partial<SessionSummaryDto> = {}): SessionSummaryDto => ({
      ...session,
      id: DELETE_ID,
      localDate: localDate(),
      startedAt: new Date(Date.now() - 3_600_000).toISOString(),
      finishedAt: new Date(Date.now() - 600_000).toISOString(),
      ...over,
    });

    async function openConfirm(
      user: ReturnType<typeof userEvent.setup>,
      recent: SessionSummaryDto,
      bootstrapOver: Partial<GymBootstrap> = {},
    ) {
      const bootstrap = makeBootstrap({
        library: [makeExercise('bench')],
        recentSessions: [recent],
        ...bootstrapOver,
      });
      const queryClient = makeGymQueryClient();
      queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
      await renderWithGym(
        <>
          <SessionDetailScreen sessionId={recent.id} />
          <Snackbar />
        </>,
        queryClient,
      );
      await user.press(await screen.findByTestId('session-detail-options'));
      await user.press(await screen.findByTestId('session-detail-menu-delete'));
      await act(() => {
        jest.advanceTimersByTime(500);
      });
      return queryClient;
    }

    beforeEach(() => {
      // Modern timers: the 8 s hold is compared against Date.now().
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      onlineManager.setOnline(true);
      setKvBackendForTests(createMemoryKvBackend());
      resetGymOwnerForTests();
      resetSnackbarForTests();
      resetSessionCorrectionsForTests();
      outbox.reload();
      setGymOwner('user-a');
    });
    afterEach(() => {
      outbox.configure(null);
      jest.useRealTimers();
    });

    it('AC4: the confirm names the workout, its sets and the week/streak change', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const today = localDate();
      await openConfirm(user, onDay(), {
        weeks: [
          { weekStart: weekStartOf(today), goal: 2, sessions: 2, status: 'met', flexTokens: 0 },
        ],
        streak: { current: 1, best: 1, flexTokens: 0, thisWeekSessions: 2, thisWeekGoal: 2 },
      });
      expect(screen.getByText('Delete this workout?')).toBeOnTheScreen();
      const body = screen.getByTestId('session-detail-delete-confirm-body');
      expect(body).toHaveTextContent(/Push Day on .*: 1 set\./);
      expect(body).toHaveTextContent(/This week goes from 2 to 1 session\./);
      expect(body).toHaveTextContent(/Your streak goes from 1 week to 0\./);
      expect(body).toHaveTextContent(/Next time targets for its exercises are worked out again\./);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('AC4: Undo within 8 s restores it and nothing is ever sent', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const send = jest.fn(() => Promise.resolve([]));
      outbox.configure({ send });
      const queryClient = await openConfirm(user, onDay());

      await user.press(screen.getByTestId('session-detail-delete-confirm-confirm'));
      // Held on the device: a tombstone waits in the outbox, unsent, and the row is gone.
      expect(outbox.getState().entries.map((e) => [e.doc.id, e.doc.status])).toEqual([
        [DELETE_ID, 'DISCARDED'],
      ]);
      expect(
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.recentSessions,
      ).toHaveLength(0);
      expect(await screen.findByText('Workout deleted')).toBeOnTheScreen();

      await act(() => {
        jest.advanceTimersByTime(3000);
      });
      await user.press(screen.getByText('Undo'));
      expect(outbox.getState().entries).toHaveLength(0);
      expect(
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.recentSessions,
      ).toHaveLength(1);

      await act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('AC4: after 8 s the delete syncs through the outbox', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const send = jest.fn((docs: { id: string }[]) =>
        Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
      );
      outbox.configure({ send });
      await openConfirm(user, onDay());
      await user.press(screen.getByTestId('session-detail-delete-confirm-confirm'));
      await act(() => Promise.resolve()); // let the delete finish queueing before the clock moves

      await act(() => {
        jest.advanceTimersByTime(7000);
      });
      expect(send).not.toHaveBeenCalled();
      await act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(send).toHaveBeenCalledTimes(1);
      const [docs] = send.mock.calls[0] ?? [];
      expect(docs).toMatchObject([{ id: DELETE_ID, status: 'DISCARDED' }]);
    });

    it('AC4: started offline, the tombstone waits and syncs once online', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const send = jest.fn((docs: { id: string }[]) =>
        Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
      );
      outbox.configure({ send });
      onlineManager.setOnline(false);
      await openConfirm(user, onDay());
      await user.press(screen.getByTestId('session-detail-delete-confirm-confirm'));
      await act(() => Promise.resolve()); // let the delete finish queueing before the clock moves
      await act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(send).not.toHaveBeenCalled();
      expect(outbox.getState().entries).toHaveLength(1);

      onlineManager.setOnline(true);
      await act(async () => {
        await outbox.flush({ force: true });
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(outbox.getState().entries).toHaveLength(0);
    });
  });
});
