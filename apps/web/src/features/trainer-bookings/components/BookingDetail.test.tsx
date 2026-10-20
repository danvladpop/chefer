// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerBookingDto } from '@chefer/types';
import { booking, client } from '../lib/test-fixtures';
import { BookingDetail } from './BookingDetail';

const m = vi.hoisted(() => ({
  booking: undefined as TrainerBookingDto | undefined,
  now: new Date(),
  marked: [] as { attendance: string }[],
  markOpts: null as null | { onSuccess: (dto: unknown, input: { attendance: string }) => void },
  cancelled: [] as unknown[],
  capture: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  deviceTimeZone: () => 'Europe/Bucharest',
}));
vi.mock('../use-bookings', () => ({
  useNow: () => m.now,
  useOnline: () => true,
  useInvalidateBookings: () => vi.fn(),
}));
vi.mock('./BookingEditor', () => ({ BookingEditor: () => null }));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ trainer: { bookings: { get: { setData: vi.fn() } } } }),
    trainer: {
      bookings: {
        get: {
          useQuery: () => ({ data: m.booking, isError: false, refetch: vi.fn() }),
        },
        markAttendance: {
          useMutation: (opts: typeof m.markOpts) => {
            m.markOpts = opts;
            return {
              mutate: (input: { attendance: string }) => {
                m.marked.push(input);
                opts?.onSuccess(m.booking, input);
              },
              isPending: false,
            };
          },
        },
        cancel: {
          useMutation: () => ({
            mutate: (input: unknown) => m.cancelled.push(input),
            isPending: false,
          }),
        },
      },
    },
  },
}));

const start = (b: TrainerBookingDto) => Date.parse(b.startsAt);

beforeEach(() => {
  m.booking = booking({ clients: [client(), client({ clientId: 'c2', name: 'Ion Pop' })] });
  m.marked = [];
  m.cancelled = [];
  m.capture.mockClear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('BookingDetail', () => {
  it('shows who, when, the workout, location; one h1', () => {
    m.now = new Date(start(m.booking!) - 3_600_000);
    render(<BookingDetail bookingId="b1" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Maria + 1');
    expect(screen.getByTestId('booking-when')).toHaveTextContent('Tue 20 Oct · 18:00–19:00');
    expect(screen.getByText('Gym Fit Center')).toBeInTheDocument();
    expect(screen.getAllByText('Lower body A')).toHaveLength(2);
  });

  it('Start opens 15 minutes before the start time', () => {
    m.now = new Date(start(m.booking!) - 16 * 60_000);
    render(<BookingDetail bookingId="b1" />);
    const disabled = screen.getByTestId('booking-start');
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAccessibleDescription('Start opens 15 minutes before');
    cleanup();
    m.now = new Date(start(m.booking!) - 15 * 60_000);
    render(<BookingDetail bookingId="b1" />);
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'href',
      '/trainer/coach/b1',
    );
  });

  it('attendance: read-only until Start opens, then Attended / No-show per client', () => {
    m.now = new Date(start(m.booking!) - 16 * 60_000);
    render(<BookingDetail bookingId="b1" />);
    expect(screen.queryByRole('button', { name: 'Attended' })).toBeNull();
    expect(screen.getAllByTestId('booking-attendance')[0]).toHaveTextContent('Not marked');
    cleanup();

    m.now = new Date(start(m.booking!) - 10 * 60_000);
    render(<BookingDetail bookingId="b1" />);
    const maria = screen.getByRole('group', { name: 'Attendance: Maria Pop' });
    fireEvent.click(within(maria).getByRole('button', { name: 'Attended' }));
    expect(m.marked).toEqual([{ bookingId: 'b1', clientId: 'c1', attendance: 'ATTENDED' }]);
    expect(m.capture).toHaveBeenCalledWith('attendance_marked', { status: 'ATTENDED' });
  });

  it('pressing the marked status again undoes it (no analytics)', () => {
    m.booking = booking({ clients: [client({ attendance: 'NO_SHOW' })] });
    m.now = new Date(start(m.booking) + 60_000);
    render(<BookingDetail bookingId="b1" />);
    const noShow = screen.getByRole('button', { name: 'No-show' });
    expect(noShow).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(noShow);
    expect(m.marked).toEqual([{ bookingId: 'b1', clientId: 'c1', attendance: 'SCHEDULED' }]);
    expect(m.capture).not.toHaveBeenCalled();
  });

  it('once started: no Edit or Cancel (the API refuses), Start and attendance stay', () => {
    m.now = new Date(start(m.booking!) + 60_000);
    render(<BookingDetail bookingId="b1" />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Attended' })).toHaveLength(2);
  });

  it('cancels a repeating booking with a scope and a reason', () => {
    m.booking = booking({ seriesId: 's1' });
    m.now = new Date(start(m.booking) - 3_600_000);
    render(<BookingDetail bookingId="b1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this booking?' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'This and following' }));
    fireEvent.change(within(dialog).getByLabelText('Reason (optional, clients see it)'), {
      target: { value: 'Gym closed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    expect(m.cancelled).toEqual([{ bookingId: 'b1', scope: 'FOLLOWING', reason: 'Gym closed' }]);
  });

  it('a cancelled booking is greyed with its reason and no actions', () => {
    m.booking = booking({ cancelledAt: '2026-10-19T08:00:00.000Z', cancelReason: 'Gym closed' });
    m.now = new Date(start(m.booking) - 3_600_000);
    render(<BookingDetail bookingId="b1" />);
    expect(screen.getByTestId('booking-detail')).toHaveAttribute('data-cancelled', 'true');
    expect(screen.getByTestId('booking-cancel-reason')).toHaveTextContent('Gym closed');
    expect(screen.queryByTestId('booking-start')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  });
});
