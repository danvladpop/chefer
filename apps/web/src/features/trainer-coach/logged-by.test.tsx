// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { HistoryList } from '@/features/gym/history/HistoryList';
import { WorkoutList } from '@/features/trainer/components/WorkoutsTab';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachedWorkoutDto, GymBootstrap, SessionSummaryDto } from '@chefer/types';

// "Logged by Ana" (the client's history) and "Logged by you" (the trainer's
// client Workouts tab) for coached workouts (trainer-mode.md §6.7, §6.9).

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      gym: {
        bootstrap: { cancel: () => Promise.resolve(), setData: vi.fn(), invalidate: vi.fn() },
        session: { list: { fetch: vi.fn() } },
      },
    }),
    gym: { session: { list: { useQuery: () => ({ data: undefined }) } } },
  },
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/gym/shared/gym-toast', () => ({ showGymToast: vi.fn() }));
afterEach(cleanup);

function summary(id: string, loggedBy?: { name: string }): SessionSummaryDto {
  return {
    id,
    name: 'Lower body A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: '2026-10-20',
    startedAt: '2026-10-20T15:00:00.000Z',
    finishedAt: '2026-10-20T16:00:00.000Z',
    isDeload: false,
    ...(loggedBy && { loggedBy }),
    exercises: [],
  };
}

function workout(id: string, loggedByTrainer?: true): CoachedWorkoutDto {
  return {
    id,
    name: 'Lower body A',
    localDate: '2026-10-20',
    startedAt: '2026-10-20T15:00:00.000Z',
    finishedAt: '2026-10-20T16:00:00.000Z',
    durationMin: 60,
    isDeload: false,
    ...(loggedByTrainer && { loggedByTrainer }),
    exercises: [],
  };
}

describe('client history: Logged by Ana', () => {
  it('labels a coached workout and leaves the client’s own alone', () => {
    const data = {
      recentSessions: [summary('coached', { name: 'Ana' }), summary('own')],
    } as unknown as GymBootstrap;
    render(<HistoryList data={data} />);
    const coached = screen.getByTestId('gym-history-row-coached');
    expect(coached).toHaveTextContent('Logged by Ana');
    expect(coached.querySelector('a')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Logged by Ana'),
    );
    expect(screen.getByTestId('gym-history-row-own')).not.toHaveTextContent('Logged by');
  });
});

describe('trainer Workouts tab: Logged by you', () => {
  it('shows the label only on workouts this trainer logged', () => {
    render(<WorkoutList workouts={[workout('w1', true), workout('w2')]} unit="KG" />);
    const labels = screen.getAllByTestId('trainer-workout-logged-by');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveTextContent('Logged by you');
  });
});
