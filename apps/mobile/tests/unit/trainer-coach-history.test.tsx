import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react-native';
import type { SessionSummaryDto } from '@chefer/types';
import { HistoryView } from '../../src/features/gym/stats/history-view';
import { makeBootstrap } from './gym-fixtures';
import { safeAreaMetrics } from './gym-workout-helpers';

// Trainer mode M3 (trainer-mode.md §6.7): a workout the trainer logged reads "Logged by Ana" in the
// client's own history (SessionSummaryDto.loggedBy, API level 8). Same harness as gym-history-view.

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

// The history header carries "Log an activity" (WP-20), whose Sheet needs the safe-area context.
function render(ui: React.ReactElement) {
  return rtlRender(<SafeAreaProvider initialMetrics={safeAreaMetrics}>{ui}</SafeAreaProvider>);
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
    coaching: { notices: { invalidate: jest.fn(), setData: jest.fn() } },
    training: { getDayKinds: { setData: jest.fn() } },
    gym: { session: { list: { fetch: fetchMock } } },
  });
  jest.spyOn(onlineManager, 'isOnline').mockReturnValue(true);
  trpc.gym.session.list.useQuery.mockReturnValue({ data: undefined });
});

describe('History — coached workouts', () => {
  it('labels a workout the trainer logged "Logged by Ana", and only that one', async () => {
    await render(
      <HistoryView
        bootstrap={makeBootstrap({
          recentSessions: [
            session({ id: 's-coached', loggedBy: { name: 'Ana' } }),
            session({
              id: 's-own',
              localDate: '2026-09-08',
              startedAt: '2026-09-08T18:00:00.000Z',
            }),
          ],
        })}
      />,
    );
    expect(screen.getByTestId('gym-history-row-s-coached-logged-by')).toHaveTextContent(
      'Logged by Ana',
    );
    expect(screen.getByTestId('gym-history-row-s-coached')).toHaveAccessibleName(/Logged by Ana$/);
    expect(screen.queryByTestId('gym-history-row-s-own-logged-by')).toBeNull();
  });
});
