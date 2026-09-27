import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { SessionSummaryDto } from '@chefer/types';
import { HistoryView } from '../../src/features/gym/stats/history-view';
import { makeBootstrap } from './gym-fixtures';

// T-36.5: Stats › History — week-grouped list of every completed session,
// cache-then-cursor `Load more`, same shape as Gym Today's `Recent`
// (gym-recent-workouts.test.tsx).

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-today.test.tsx
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
    name: 'Upper A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: '2026-09-10',
    startedAt: '2026-09-10T18:00:00.000Z',
    finishedAt: '2026-09-10T18:52:00.000Z',
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

describe('HistoryView', () => {
  it('shows the empty state with no completed sessions', async () => {
    await render(<HistoryView bootstrap={makeBootstrap({ recentSessions: [] })} />);
    expect(screen.getByTestId('gym-history-empty')).toBeOnTheScreen();
  });

  it('groups sessions by ISO week and opens a row into its detail', async () => {
    const user = userEvent.setup();
    const sessions: SessionSummaryDto[] = [
      session({ id: 's1', localDate: '2026-09-10' }), // Thu, week of 2026-09-07
      session({ id: 's2', localDate: '2026-09-01' }), // Tue, week of 2026-08-31
    ];
    await render(<HistoryView bootstrap={makeBootstrap({ recentSessions: sessions })} />);

    expect(screen.getByTestId('gym-history-week-2026-09-07')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-history-week-2026-08-31')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-history-row-s1')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-history-row-s1')).toHaveTextContent(/52 min · 1 sets/);

    await user.press(screen.getByTestId('gym-history-row-s1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/session/[id]',
      params: { id: 's1' },
    });
  });

  it('Load more pages the cache first, then the online cursor once exhausted', async () => {
    const user = userEvent.setup();
    const cached: SessionSummaryDto[] = Array.from({ length: 3 }, (_, i) =>
      session({ id: `s${i}`, localDate: '2026-09-10' }),
    );
    fetchMock.mockResolvedValueOnce({
      items: [session({ id: 'online-1', localDate: '2026-08-01' })],
      nextCursor: null,
    });
    await render(<HistoryView bootstrap={makeBootstrap({ recentSessions: cached })} />);

    await user.press(screen.getByTestId('gym-history-load-more'));
    await waitFor(() => expect(screen.getByTestId('gym-history-row-online-1')).toBeOnTheScreen());
    expect(fetchMock).toHaveBeenCalledWith({
      cursor: `${cached[2]?.startedAt}|${cached[2]?.id}`,
      limit: 10,
    });
    expect(screen.queryByTestId('gym-history-load-more')).not.toBeOnTheScreen();
  });

  it('shows "Connect to load older workouts." offline once the cache is exhausted', async () => {
    jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
    const user = userEvent.setup();
    const cached: SessionSummaryDto[] = [session({ id: 's1' })];
    await render(<HistoryView bootstrap={makeBootstrap({ recentSessions: cached })} />);

    await user.press(screen.getByTestId('gym-history-load-more'));
    await waitFor(() =>
      expect(screen.getByTestId('gym-history-error')).toHaveTextContent(
        /Connect to load older workouts\./,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
