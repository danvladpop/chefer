import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { SessionSummaryDto } from '@chefer/types';
import { localDate } from '../../src/features/gym/offline/ids';
import { RecentWorkouts } from '../../src/features/gym/today/recent-workouts';
import { makeBootstrap } from './gym-fixtures';
import { safeAreaMetrics } from './gym-workout-helpers';

// T-36.A2.1 (UX-36 A2, AC12-14): the `Recent` section, built on
// `groupRecentSessions()` (pure + already tested). These tests cover the
// screen-level behaviour: day-header grouping with same-day start times,
// hiding when there are no sessions, PR badges, and "Show more" paging
// (cache first, then the online cursor).

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require, see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof import('./gym-trpc-mock').createTrpcGymMock>>(
    '../../src/lib/trpc',
  );
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function session(overrides: Partial<SessionSummaryDto> & { id: string }): SessionSummaryDto {
  return {
    name: 'Full Body A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: localDate(),
    startedAt: `${localDate()}T18:10:00.000Z`,
    finishedAt: `${localDate()}T18:52:00.000Z`,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 2,
        sets: [{ weightKg: 60, reps: 10, isWarmup: false, completed: true }],
      },
    ],
    ...overrides,
  };
}

const today = localDate();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const YESTERDAY = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const TWO_DAYS_AGO = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;

let fetchMock: ReturnType<typeof trpc.useUtils>['gym']['session']['list']['fetch'];

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn((_input: { cursor?: string; limit: number }) =>
    Promise.resolve<{ items: SessionSummaryDto[]; nextCursor: string | null }>({
      items: [],
      nextCursor: null,
    }),
  );
  trpc.useUtils.mockReturnValue({
    client: { gym: { bootstrap: { query: jest.fn() } } },
    preferences: { get: { invalidate: jest.fn() } },
    training: { getDayKinds: { setData: jest.fn() } },
    gym: { session: { list: { fetch: fetchMock } } },
  });
  jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('RecentWorkouts', () => {
  it('is hidden when there are no completed sessions', async () => {
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: [] })} />);
    expect(screen.queryByText('RECENT')).not.toBeOnTheScreen();
  });

  it('groups 3 sessions under day headers, showing start times only for the same-day pair', async () => {
    const sessions: SessionSummaryDto[] = [
      session({
        id: 's1',
        localDate: today,
        startedAt: `${today}T18:10:00` /* local wall clock */,
        name: 'Full Body A',
      }),
      session({
        id: 's2',
        localDate: today,
        startedAt: `${today}T07:30:00`,
        name: 'Evening ride',
      }),
      session({
        id: 's3',
        localDate: YESTERDAY,
        startedAt: `${YESTERDAY}T18:00:00.000Z`,
        name: 'Full Body B',
      }),
      session({ id: 's4', localDate: YESTERDAY, startedAt: `${YESTERDAY}T06:00:00.000Z` }),
    ];
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />);

    expect(screen.getByText('RECENT')).toBeOnTheScreen();
    expect(screen.getByTestId(`gym-today-recent-heading-${today}`)).toHaveTextContent('Today');
    expect(screen.getByTestId('gym-today-recent-row-s1')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-today-recent-row-s2')).toBeOnTheScreen();
    // Only 3 shown by default — s4 (the 4th) is not rendered yet.
    expect(screen.queryByTestId('gym-today-recent-row-s4')).not.toBeOnTheScreen();
    // Same-day pair (s1/s2) shows a start time; no ISO date anywhere.
    expect(screen.getByTestId('gym-today-recent-row-s1')).toHaveTextContent(/18:10/);
    expect(screen.getByTestId('gym-today-recent-row-s2')).toHaveTextContent(/07:30/);
    expect(screen.queryByText(today)).not.toBeOnTheScreen();
    expect(screen.queryByText(YESTERDAY)).not.toBeOnTheScreen();
  });

  // WP-20: a quick-logged activity reads "45 min · ~400 kcal", not "1 sets".
  it('shows an activity row as minutes and kcal instead of a set count', async () => {
    const activity = session({
      id: 'act1',
      name: 'Cycling class',
      startedAt: `${today}T17:00:00.000Z`,
      finishedAt: `${today}T17:45:00.000Z`,
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
              caloriesKcal: 400,
            },
          ],
        },
      ],
    });
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: [activity] })} />);

    const row = screen.getByTestId('gym-today-recent-row-act1');
    expect(row).toHaveTextContent(/45 min · ~400 kcal/);
    expect(row).not.toHaveTextContent(/sets/);
    expect(row.props.accessibilityLabel).toMatch(/45 minutes, about 400 kilocalories/);
  });

  it('shows a PR badge on a row that beat a prior best', async () => {
    // T-05.6 (UX-05 F): the very first logged set for an exercise now
    // counts as a PR too, so s0 (the earliest) also gets the badge — s1
    // matches it exactly (no PR), and s2 beats both (PR).
    const sessions: SessionSummaryDto[] = [
      session({
        id: 's2',
        localDate: today,
        startedAt: `${today}T18:00:00.000Z`,
        exercises: [
          {
            exerciseId: 'bench',
            skipped: false,
            lastSetRir: 2,
            sets: [{ weightKg: 110, reps: 5, isWarmup: false, completed: true }],
          },
        ],
      }),
      session({
        id: 's1',
        localDate: YESTERDAY,
        startedAt: `${YESTERDAY}T18:00:00.000Z`,
        exercises: [
          {
            exerciseId: 'bench',
            skipped: false,
            lastSetRir: 2,
            sets: [{ weightKg: 100, reps: 5, isWarmup: false, completed: true }],
          },
        ],
      }),
      session({
        id: 's0',
        localDate: TWO_DAYS_AGO,
        startedAt: `${TWO_DAYS_AGO}T18:00:00.000Z`,
        exercises: [
          {
            exerciseId: 'bench',
            skipped: false,
            lastSetRir: 2,
            sets: [{ weightKg: 100, reps: 5, isWarmup: false, completed: true }],
          },
        ],
      }),
    ];
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />);

    expect(screen.getByTestId('gym-today-recent-row-s2')).toHaveTextContent(/PR/);
    expect(screen.getByTestId('gym-today-recent-row-s1')).not.toHaveTextContent(/PR/);
    expect(screen.getByTestId('gym-today-recent-row-s0')).toHaveTextContent(/PR/);
  });

  it('tapping a row opens its session detail', async () => {
    const user = userEvent.setup();
    const sessions: SessionSummaryDto[] = [session({ id: 's1' })];
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />);

    await user.press(screen.getByTestId('gym-today-recent-row-s1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/session/[id]',
      params: { id: 's1' },
    });
  });

  it('Show more pages 5 more from the cache before touching the network', async () => {
    const user = userEvent.setup();
    const sessions: SessionSummaryDto[] = Array.from({ length: 8 }, (_, i) =>
      session({
        id: `s${i}`,
        localDate: YESTERDAY,
        startedAt: `${YESTERDAY}T${String(18 - i).padStart(2, '0')}:00:00.000Z`,
      }),
    );
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />);

    expect(screen.queryByTestId('gym-today-recent-row-s3')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-today-recent-show-more'));
    await waitFor(() => expect(screen.getByTestId('gym-today-recent-row-s3')).toBeOnTheScreen());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Show more falls back to the online cursor once the cache is exhausted', async () => {
    const user = userEvent.setup();
    const cached: SessionSummaryDto[] = Array.from({ length: 3 }, (_, i) =>
      session({
        id: `s${i}`,
        localDate: YESTERDAY,
        startedAt: `${YESTERDAY}T${String(18 - i).padStart(2, '0')}:00:00.000Z`,
      }),
    );
    fetchMock.mockResolvedValueOnce({
      items: [session({ id: 'online-1', localDate: YESTERDAY })],
      nextCursor: null,
    });
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: cached })} />);

    await user.press(screen.getByTestId('gym-today-recent-show-more'));
    await waitFor(() =>
      expect(screen.getByTestId('gym-today-recent-row-online-1')).toBeOnTheScreen(),
    );
    expect(fetchMock).toHaveBeenCalledWith({
      cursor: `${cached[2]?.startedAt}|${cached[2]?.id}`,
      limit: 5,
    });
    // The online page said there is nothing more — Show more disappears.
    expect(screen.queryByTestId('gym-today-recent-show-more')).not.toBeOnTheScreen();
  });

  it('shows "Connect to load older workouts." offline once the cache is exhausted', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    const user = userEvent.setup();
    const cached: SessionSummaryDto[] = Array.from({ length: 3 }, (_, i) =>
      session({ id: `s${i}`, localDate: YESTERDAY }),
    );
    await render(<RecentWorkouts bootstrap={makeBootstrap({ recentSessions: cached })} />);

    await user.press(screen.getByTestId('gym-today-recent-show-more'));
    await waitFor(() =>
      expect(screen.getByTestId('gym-today-recent-error')).toHaveTextContent(
        /Connect to load older workouts\./,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"All history" opens Stats', async () => {
    const user = userEvent.setup();
    await render(
      <RecentWorkouts bootstrap={makeBootstrap({ recentSessions: [session({ id: 's1' })] })} />,
    );

    await user.press(screen.getByTestId('gym-today-recent-all-history'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/stats', params: { tab: 'history' } });
  });

  // ── UX-44 (T-44.1, AC1, AC7) ───────────────────────────────────────────────
  it('AC1: ⋯ → Edit workout opens edit mode in two taps, and the row exposes Edit/Delete actions', async () => {
    const user = userEvent.setup();
    const sessions = [session({ id: 's1', localDate: today, name: 'Full Body A' })];
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />
      </SafeAreaProvider>,
    );

    const row = screen.getByTestId('gym-today-recent-row-s1');
    expect(row.props.accessibilityActions).toEqual(
      expect.arrayContaining([
        { name: 'edit', label: 'Edit' },
        { name: 'delete', label: 'Delete' },
      ]),
    );
    const options = screen.getByTestId('gym-today-recent-row-s1-options');
    expect(options.props.accessibilityLabel).toMatch(/^Options for Full Body A, /);

    await user.press(options); // tap 1
    await user.press(await screen.findByTestId('gym-today-recent-menu-edit')); // tap 2
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/workout',
      params: { edit: 's1' },
    });
  });

  it('⋯ → Delete workout opens the confirm (no native Alert)', async () => {
    const user = userEvent.setup();
    const sessions = [session({ id: 's1', localDate: today, name: 'Full Body A' })];
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <RecentWorkouts bootstrap={makeBootstrap({ recentSessions: sessions })} />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('gym-today-recent-row-s1-options'));
    await user.press(await screen.findByTestId('gym-today-recent-menu-delete'));
    expect(await screen.findByText('Delete this workout?')).toBeOnTheScreen();
    expect(screen.getByText('Keep it')).toBeOnTheScreen();
  });
});
