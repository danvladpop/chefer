// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { booking, client } from '@/features/trainer-bookings/lib/test-fixtures';
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
  const editorTarget: unknown = null;
  return {
    summary,
    refetch: vi.fn(),
    notices,
    now: new Date('2026-10-20T12:00:00.000Z'),
    editorTarget,
  };
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
vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  deviceTimeZone: () => 'Europe/Bucharest',
}));
vi.mock('@/features/trainer-bookings/use-bookings', () => ({ useNow: () => m.now }));
vi.mock('@/features/trainer-bookings/components/BookingEditor', () => ({
  BookingEditor: ({ target }: { target: unknown }) => {
    m.editorTarget = target;
    return null;
  },
}));
vi.mock('@/features/trainer/components/InviteSheet', () => ({
  InviteSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Invite a client" /> : null,
}));

afterEach(() => {
  cleanup();
  m.notices = [];
  m.editorTarget = null;
  m.now = new Date('2026-10-20T12:00:00.000Z');
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
      '/trainer/workouts/new',
    );
    expect(screen.queryByTestId('trainer-stat-active')).toBeNull();
    fireEvent.click(within(empty).getByRole('button', { name: 'Invite a client' }));
    expect(screen.getByRole('dialog', { name: 'Invite a client' })).toBeInTheDocument();
    // M3: "Add a booking" is back, and opens the booking editor.
    fireEvent.click(within(empty).getByRole('button', { name: 'Add a booking' }));
    expect(m.editorTarget).toMatchObject({ mode: 'create' });
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

  describe('booking parts (M3)', () => {
    // 18:00 Bucharest on Tue 20 Oct = 15:00Z; "now" is 12:00Z (15:00 local).
    const next = booking({
      id: 'next',
      clients: [client(), client({ clientId: 'c2', name: 'Ion Pop' })],
    });

    it('the next booking today: time, names, workout, location, Start closed until 15 min before', () => {
      show(
        summary({
          nextBooking: next,
          todayBookings: [],
          bookingsThisWeek: { scheduled: 5, done: 3 },
        }),
      );
      const card = screen.getByTestId('trainer-today-next');
      expect(card).toHaveTextContent('18:00–19:00');
      expect(card).toHaveTextContent('Maria Pop, Ion Pop');
      expect(card).toHaveTextContent('Lower body A');
      expect(card).toHaveTextContent('Gym Fit Center');
      expect(within(card).getByTestId('booking-start')).toBeDisabled();
      expect(screen.getByTestId('trainer-stat-bookings')).toHaveTextContent('Bookings this week');
    });

    it('Start opens from 15 minutes before', () => {
      m.now = new Date(Date.parse(next.startsAt) - 10 * 60_000);
      show(summary({ nextBooking: next }));
      expect(
        within(screen.getByTestId('trainer-today-next')).getByRole('link', { name: 'Start' }),
      ).toHaveAttribute('href', '/trainer/coach/next');
    });

    it('nothing today: "No bookings today", the next one, and Add a booking opens the editor', () => {
      const later = booking({ id: 'later', date: '2026-10-22' });
      show(summary({ nextBooking: later }));
      const card = screen.getByTestId('trainer-today-next');
      expect(card).toHaveTextContent('No bookings today');
      expect(within(card).getByRole('link')).toHaveAttribute('href', '/trainer/bookings/later');
      fireEvent.click(within(card).getByRole('button', { name: 'Add a booking' }));
      expect(m.editorTarget).toMatchObject({ mode: 'create', date: '2026-10-20', time: '16:00' });
    });

    it('lists the rest of today, past bookings needing attendance, and sessions delivered', () => {
      show(
        summary({
          nextBooking: next,
          todayBookings: [booking({ id: 't2', time: '20:00' })],
          unmarkedAttendance: [
            booking({ id: 'p1', date: '2026-10-19' }),
            booking({ id: 'p2', date: '2026-10-18' }),
          ],
          sessionsDelivered: [{ clientId: 'c1', name: 'Maria', count: 6 }],
        }),
      );
      const later = screen.getByTestId('trainer-today-bookings');
      expect(within(later).getByRole('link')).toHaveAttribute('href', '/trainer/bookings/t2');
      expect(later).toHaveTextContent('20:00–21:00');
      const unmarked = screen.getByTestId('trainer-today-unmarked');
      expect(unmarked).toHaveTextContent('2 past bookings need attendance');
      expect(within(unmarked).getAllByRole('link')).toHaveLength(2);
      expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
      const delivered = screen.getByTestId('trainer-today-delivered');
      expect(within(delivered).getByRole('link', { name: 'Maria · 6' })).toHaveAttribute(
        'href',
        '/trainer/c1?tab=bookings',
      );
      expect(delivered).toHaveTextContent('Counts bookings you marked as attended.');
    });

    it('an M1 server (no booking fields) shows no booking parts', () => {
      show(summary());
      expect(screen.queryByTestId('trainer-today-next')).toBeNull();
      expect(screen.queryByTestId('trainer-today-delivered')).toBeNull();
    });
  });
});
