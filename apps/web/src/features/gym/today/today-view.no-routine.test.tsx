// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayView } from './today-view';

// UX-GYM-15 (web twin): with no active routine Today keeps the week ring,
// "Log a workout you already did" and Recent workouts — they must not be tied
// to the routine's "Next up" card. Heavy children are stubbed; this pins which
// sections the view renders.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ gym: { bootstrap: { invalidate: vi.fn() } } }),
    gym: {
      routine: { setNextDay: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
    },
  },
}));
vi.mock('../workout/use-active-workout', () => ({
  useActiveWorkout: () => ({ session: null, start: vi.fn() }),
}));
vi.mock('../shared/use-gym-data', () => ({
  useGymData: () => ({
    data: {
      profile: { setupCompletedAt: null },
      activeRoutine: null,
      nextWorkout: null,
      recentSessions: [],
      weeks: [],
      offers: [],
      streak: { thisWeekGoal: 3, thisWeekSessions: 0, current: 0, flexTokens: 0 },
    },
    lookup: () => undefined,
    unit: 'KG',
    today: '2026-10-05',
    ready: true,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../shared/week-strip', () => ({ weekDays: () => [], WeekStrip: () => null }));
vi.mock('../shared/week-ring', () => ({ WeekRing: () => <div data-testid="week-ring" /> }));
vi.mock('../shared/sync-indicator', () => ({ SyncIndicator: () => null }));
vi.mock('./RecentWorkouts', () => ({
  RecentWorkouts: () => <div data-testid="recent-workouts" />,
}));
vi.mock('./pick-day-sheet', () => ({ PickDaySheet: () => null }));
vi.mock('./HowThisWorksSheet', () => ({ HowThisWorksSheet: () => null }));
vi.mock('./log-past-workout-sheet', () => ({
  LogPastWorkoutSheet: () => null,
  backfillDateFor: () => null,
  buildBackfillWorkout: () => null,
}));

afterEach(cleanup);

describe('TodayView with no active routine', () => {
  it('points to Routine but keeps the week, the backfill link and Recent workouts', () => {
    render(<TodayView />);
    expect(screen.getByRole('link', { name: 'Go to Routine' })).toBeInTheDocument();
    expect(screen.queryByTestId('gym-next-up')).toBeNull();
    expect(screen.getByTestId('week-ring')).toBeInTheDocument();
    expect(screen.getByTestId('gym-log-past-workout')).toHaveTextContent(
      'Log a workout you already did',
    );
    expect(screen.getByTestId('recent-workouts')).toBeInTheDocument();
  });
});
