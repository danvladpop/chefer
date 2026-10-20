// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerDashboardSummaryDto } from '@chefer/types';
import { TrainerToday } from './TrainerToday';

interface SummaryQuery {
  isLoading: boolean;
  isError: boolean;
  data: TrainerDashboardSummaryDto | undefined;
  error: unknown;
}

const m = vi.hoisted(() => {
  const summary: SummaryQuery = { isLoading: false, isError: false, data: undefined, error: null };
  const notices: { id: string; text: string; testId: string }[] = [];
  return { summary, refetch: vi.fn(), notices };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    trainer: {
      dashboard: {
        summary: { useQuery: () => ({ ...m.summary, refetch: m.refetch }) },
      },
    },
  },
}));
vi.mock('@/features/coaching/components/CoachingNoticeList', () => ({
  CoachingNoticeList: () => null,
  useCoachingNoticeViews: () => ({ views: m.notices, dismiss: vi.fn() }),
  NoticeCard: ({ notice }: { notice: { text: string; testId: string } }) => (
    <li data-testid={notice.testId}>{notice.text}</li>
  ),
}));
vi.mock('@/features/trainer/components/InviteSheet', () => ({
  InviteSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Invite a client" /> : null,
}));

afterEach(() => {
  cleanup();
  m.notices = [];
});

function summary(over: Partial<TrainerDashboardSummaryDto> = {}): TrainerDashboardSummaryDto {
  return {
    activeClients: 3,
    maxClients: 50,
    requestsWaiting: 0,
    averageAdherence: 0.5,
    quietClients: [],
    bookingsThisWeek: null,
    ...over,
  };
}

function show(data: TrainerDashboardSummaryDto) {
  m.summary = { isLoading: false, isError: false, data, error: null };
  render(<TrainerToday />);
}

describe('TrainerToday', () => {
  it('has one h1', () => {
    show(summary());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the requests card only while requests wait, with Review → Clients requests', () => {
    show(summary());
    expect(screen.queryByTestId('trainer-today-requests')).toBeNull();
    cleanup();
    show(summary({ requestsWaiting: 2 }));
    const card = screen.getByTestId('trainer-today-requests');
    expect(card).toHaveTextContent('2 people asked you to coach them');
    expect(within(card).getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/trainer/clients#trainer-requests',
    );
  });

  it('shows this week: active of 50, adherence ring, quiet count; no bookings stat before M3', () => {
    show(
      summary({
        activeClients: 4,
        averageAdherence: 0.75,
        quietClients: [
          { clientId: 'c1', name: 'Maria Pop', lastWorkoutDate: null, inactiveDays: 9 },
        ],
      }),
    );
    expect(screen.getByTestId('trainer-stat-active')).toHaveTextContent('of 50');
    expect(screen.getByRole('progressbar', { name: 'Average adherence: 75%' })).toBeInTheDocument();
    expect(screen.getByTestId('trainer-stat-quiet')).toHaveTextContent('7+ days without a workout');
    expect(screen.queryByTestId('trainer-stat-bookings')).toBeNull();
  });

  it('reads "No goals yet" when no client has a goal', () => {
    show(summary({ averageAdherence: null }));
    expect(screen.getByTestId('trainer-stat-adherence')).toHaveTextContent('No goals yet');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('lists quiet clients with their last workout and a link to the client', () => {
    show(
      summary({
        quietClients: [
          { clientId: 'c1', name: 'Maria Pop', lastWorkoutDate: null, inactiveDays: 12 },
          { clientId: 'c2', name: 'Ion Rus', lastWorkoutDate: '2026-10-08', inactiveDays: 10 },
        ],
      }),
    );
    const rows = screen.getAllByTestId('trainer-today-quiet-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/trainer/c1');
    expect(rows[0]).toHaveTextContent('No workout yet');
    expect(rows[0]).toHaveTextContent('12 days without a workout');
    expect(rows[1]).toHaveTextContent(/Last workout/);
  });

  it('says all caught up with no quiet clients and no notices, and lists notices otherwise', () => {
    show(summary());
    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
    cleanup();
    m.notices = [{ id: 'n1', text: 'Maria left', testId: 'notice-left' }];
    show(summary());
    expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
    expect(screen.getByTestId('coaching-notices-trainer')).toHaveTextContent('Maria left');
  });

  it('a brand-new trainer gets invite / template / booking actions, and invite opens the sheet', () => {
    show(summary({ activeClients: 0, averageAdherence: null }));
    const empty = screen.getByTestId('trainer-today-empty');
    expect(within(empty).getByRole('link', { name: 'Build a template' })).toHaveAttribute(
      'href',
      '/trainer/workouts',
    );
    // Bookings arrive in M3: no "Add a booking" until then (mobile alike).
    expect(within(empty).queryByRole('link', { name: 'Add a booking' })).toBeNull();
    expect(screen.queryByTestId('trainer-stat-active')).toBeNull();
    fireEvent.click(within(empty).getByRole('button', { name: 'Invite a client' }));
    expect(screen.getByRole('dialog', { name: 'Invite a client' })).toBeInTheDocument();
  });

  it('shows a skeleton while loading and an alert with Retry on error', () => {
    m.summary = { isLoading: true, isError: false, data: undefined, error: null };
    render(<TrainerToday />);
    expect(screen.getByTestId('trainer-today-loading')).toBeInTheDocument();
    cleanup();
    m.summary = { isLoading: false, isError: true, data: undefined, error: new Error('down') };
    render(<TrainerToday />);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    expect(m.refetch).toHaveBeenCalled();
  });
});
