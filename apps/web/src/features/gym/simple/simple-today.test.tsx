// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymBootstrap, RoutineDto } from '@chefer/types';
import { createMemoryStorage, setStorageForTests } from '../workout/storage';
import { SimpleTodayBody } from './simple-today';

// "Keep it simple" Today on web: today's planned workout from My week with
// Start / Log a workout / Skip, "Start a workout" with the type picker, and
// the routine's unscheduled days as shortcuts.

const m = vi.hoisted(() => ({ start: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, replace: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: { useUtils: () => ({ gym: { bootstrap: { cancel: vi.fn(), setData: vi.fn() } } }) },
}));
vi.mock('@/features/flags/use-flags', () => ({ useFlags: () => ({ simpleTraining: true }) }));
vi.mock('../workout/use-active-workout', () => ({
  useActiveWorkout: () => ({ session: null, start: m.start }),
  foldFinished: vi.fn(),
}));
vi.mock('../today/RecentWorkouts', () => ({ RecentWorkouts: () => null }));
vi.mock('../shared/sync-indicator', () => ({ SyncIndicator: () => null }));

const TUESDAY = '2026-10-13';

const routine: RoutineDto = {
  id: 'r1',
  name: 'My week',
  templateKey: null,
  isActive: true,
  nextDayId: null,
  version: 1,
  archived: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
  days: [
    {
      id: 'yoga',
      position: 0,
      name: 'Yoga',
      plannedWeekday: 1,
      workoutType: 'YOGA',
      exercises: [],
    },
    { id: 'push', position: 1, name: 'Push A', plannedWeekday: null, exercises: [] },
  ],
};

function bootstrap(): GymBootstrap {
  return {
    profile: { weeklyGoal: 3, trainingStyle: 'SIMPLE' },
    activeRoutine: routine,
    recentSessions: [],
    streak: { current: 2, best: 2, flexTokens: 0, thisWeekSessions: 1, thisWeekGoal: 3 },
    bodyweightKg: null,
  } as unknown as GymBootstrap;
}

beforeEach(() => {
  vi.clearAllMocks();
  setStorageForTests(createMemoryStorage());
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  setStorageForTests(null);
});

describe('SimpleTodayBody', () => {
  it("shows today's planned workout and starts it as a typed workout of that day", () => {
    render(<SimpleTodayBody data={bootstrap()} today={TUESDAY} />);
    const planned = screen.getByTestId('gym-simple-planned');
    expect(planned).toHaveTextContent('Tuesday');
    expect(planned).toHaveTextContent('Yoga');
    expect(screen.getByText('This week · 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Log your weight to see calories')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('gym-simple-start-planned'));
    expect(m.start).toHaveBeenCalledWith({
      kind: 'simple',
      workoutType: 'YOGA',
      name: 'Yoga',
      routine: { routineId: 'r1', dayId: 'yoga' },
      exercises: [],
    });
    expect(m.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('Skip leaves "Start a workout" — and remembers it for today', () => {
    render(<SimpleTodayBody data={bootstrap()} today={TUESDAY} />);
    fireEvent.click(screen.getByTestId('gym-simple-skip'));
    expect(screen.queryByTestId('gym-simple-planned')).toBeNull();
    expect(screen.getByText('Nothing planned today')).toBeInTheDocument();
    cleanup();
    render(<SimpleTodayBody data={bootstrap()} today={TUESDAY} />);
    expect(screen.queryByTestId('gym-simple-planned')).toBeNull();
  });

  it('"Start a workout" picks a type (preselected from today) and starts it', () => {
    render(<SimpleTodayBody data={bootstrap()} today={TUESDAY} />);
    fireEvent.click(screen.getByTestId('gym-simple-start'));
    expect(screen.getByRole('dialog', { name: 'What are you training?' })).toBeInTheDocument();
    expect(screen.getByTestId('gym-simple-type-YOGA')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('gym-simple-type-SPIN'));
    fireEvent.click(screen.getByTestId('gym-simple-type-confirm'));
    expect(m.start).toHaveBeenCalledWith({ kind: 'simple', workoutType: 'SPIN', name: 'Spin' });
  });

  it('offers unscheduled routine days as shortcuts', () => {
    render(<SimpleTodayBody data={bootstrap()} today={TUESDAY} />);
    fireEvent.click(screen.getByTestId('gym-simple-unscheduled-push'));
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'simple', workoutType: 'STRENGTH_OTHER', name: 'Push A' }),
    );
  });
});
