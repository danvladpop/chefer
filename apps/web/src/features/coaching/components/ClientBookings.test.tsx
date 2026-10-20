// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientBookingDto, CoachingStatusDto } from '@chefer/types';
import { ClientBookingDetail, UpcomingBookingCard, UpcomingBookingsList } from './ClientBookings';

const m = vi.hoisted(
  (): { status: CoachingStatusDto; upcoming: ClientBookingDto[]; upcomingEnabled: boolean[] } => ({
    status: { trainer: { name: 'Ana', since: '2026-09-01' }, stopped: null },
    upcoming: [],
    upcomingEnabled: [],
  }),
);

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
vi.mock('@/features/trainer-bookings/use-bookings', () => ({
  useNow: () => new Date('2026-10-19T09:00:00.000Z'),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    coaching: {
      availability: { useQuery: () => ({ data: { enabled: true, canBeTrainer: false } }) },
      status: { useQuery: () => ({ data: m.status }) },
      bookings: {
        upcoming: {
          useQuery: (_: unknown, opts: { enabled: boolean }) => {
            m.upcomingEnabled.push(opts.enabled);
            return { data: opts.enabled ? m.upcoming : undefined };
          },
        },
        get: { useQuery: () => ({ data: m.upcoming[0], isError: false }) },
      },
    },
  },
}));

const b = (
  id: string,
  startsAt: string,
  over: Partial<ClientBookingDto> = {},
): ClientBookingDto => ({
  id,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
  durationMin: 60,
  timeZone: 'Europe/Bucharest',
  trainer: { name: 'Ana' },
  location: 'Gym Fit Center',
  note: null,
  workoutName: null,
  otherClients: 0,
  cancelledAt: null,
  cancelReason: null,
  ...over,
});

beforeEach(() => {
  m.status = { trainer: { name: 'Ana', since: '2026-09-01' }, stopped: null };
  m.upcoming = [];
  m.upcomingEnabled = [];
});
afterEach(cleanup);

describe('UpcomingBookingCard (Today, Gym Today)', () => {
  it('shows the next booking within 7 days and opens its detail', () => {
    m.upcoming = [b('b2', '2026-10-22T15:00:00.000Z'), b('b1', '2026-10-20T15:00:00.000Z')];
    render(<UpcomingBookingCard />);
    const card = screen.getByTestId('client-booking-card');
    expect(card).toHaveTextContent('Session with Ana · Tue 18:00 · Gym Fit Center');
    expect(card).toHaveAttribute('href', '/coaching/bookings/b1');
  });

  it('a group booking reads "with 1 other" and never another name', () => {
    m.upcoming = [b('b1', '2026-10-20T15:00:00.000Z', { otherClients: 1 })];
    render(<UpcomingBookingCard />);
    expect(screen.getByTestId('client-booking-card')).toHaveTextContent(
      'Session with Ana · Tue 18:00 · Gym Fit Center · with 1 other',
    );
  });

  it('nothing beyond 7 days, and nothing is fetched without a trainer', () => {
    m.upcoming = [b('far', '2026-10-27T15:00:00.000Z')];
    render(<UpcomingBookingCard />);
    expect(screen.queryByTestId('client-booking-card')).toBeNull();
    cleanup();
    m.status = { trainer: null, stopped: null };
    m.upcomingEnabled = [];
    render(<UpcomingBookingCard />);
    expect(m.upcomingEnabled.every((e) => !e)).toBe(true);
  });
});

describe('UpcomingBookingsList (Your trainer)', () => {
  it('lists upcoming bookings, cancelled ones greyed, or says none', () => {
    render(<UpcomingBookingsList />);
    expect(screen.getByText('No bookings coming up.')).toBeInTheDocument();
    cleanup();
    m.upcoming = [
      b('b1', '2026-10-20T15:00:00.000Z'),
      b('b2', '2026-10-27T15:00:00.000Z', { cancelledAt: '2026-10-19T08:00:00.000Z' }),
    ];
    render(<UpcomingBookingsList />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Tue 20 Oct, 18:00–19:00');
    expect(links[1]).toHaveTextContent('Cancelled');
  });
});

describe('ClientBookingDetail', () => {
  it('read-only: trainer, time, location, workout, note, others count', () => {
    m.upcoming = [
      b('b1', '2026-10-20T15:00:00.000Z', {
        note: 'Bring your belt',
        workoutName: 'Lower body A',
        otherClients: 1,
      }),
    ];
    render(<ClientBookingDetail bookingId="b1" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your booking');
    const detail = screen.getByTestId('client-booking-detail');
    expect(detail).toHaveTextContent('Session with Ana · Tue 20 Oct');
    expect(detail).toHaveTextContent('18:00–19:00');
    expect(detail).toHaveTextContent('Gym Fit Center');
    expect(detail).toHaveTextContent('Lower body A');
    expect(detail).toHaveTextContent('Bring your belt');
    expect(detail).toHaveTextContent('with 1 other');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
