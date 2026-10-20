// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerBookingDto } from '@chefer/types';
import { booking } from '../lib/test-fixtures';
import { ScheduleView } from './ScheduleView';

interface Mocks {
  wide: boolean;
  online: boolean;
  inputs: { from: string; to: string }[];
  bookings: TrainerBookingDto[];
  push: ReturnType<typeof vi.fn>;
  editorTarget: unknown;
}
const m = vi.hoisted(
  (): Mocks => ({
    wide: true,
    online: true,
    inputs: [],
    bookings: [],
    push: vi.fn(),
    editorTarget: null,
  }),
);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  deviceTimeZone: () => 'Europe/Bucharest',
}));
vi.mock('../use-bookings', () => ({
  // Tue 20 Oct 2026, 15:00 in Bucharest.
  useNow: () => new Date('2026-10-20T12:00:00.000Z'),
  useOnline: () => m.online,
  useInvalidateBookings: () => vi.fn(),
}));
vi.mock('./BookingEditor', () => ({
  BookingEditor: ({ target }: { target: unknown }) => {
    m.editorTarget = target;
    return null;
  },
}));
vi.mock('./ScopeChoice', () => ({ ScopeSheet: () => null }));
vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    trainer: {
      bookings: {
        range: {
          useQuery: (input: { from: string; to: string }) => {
            m.inputs.push(input);
            return {
              data: { bookings: m.bookings },
              isLoading: false,
              isError: false,
              dataUpdatedAt: Date.parse('2026-10-20T11:30:00.000Z'),
            };
          },
        },
        update: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}));

const distinctInputs = () => [...new Set(m.inputs.map((i) => `${i.from}/${i.to}`))];

beforeEach(() => {
  m.inputs = [];
  m.bookings = [booking()];
  m.wide = true;
  m.online = true;
  m.editorTarget = null;
  window.matchMedia = ((q: string) => ({
    matches: m.wide,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('ScheduleView', () => {
  it('Week by default from sm: one range call for the visible week; one h1', () => {
    render(<ScheduleView />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('schedule-day')).toHaveLength(7);
    expect(distinctInputs()).toEqual(['2026-10-18T21:00:00.000Z/2026-10-25T22:00:00.000Z']);
    expect(screen.getByTestId('schedule-range-title')).toHaveTextContent('19 Oct – 25 Oct');
  });

  it('switching to Day reads the same cached week (no new range)', () => {
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getAllByTestId('schedule-day')).toHaveLength(1);
    expect(screen.getByTestId('schedule-day-strip')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sat 24 Oct' }));
    expect(screen.getByTestId('schedule-range-title')).toHaveTextContent('Sat 24 Oct');
    expect(distinctInputs()).toHaveLength(1);
  });

  it('Day by default below sm; next week asks for the next week', () => {
    m.wide = false;
    render(<ScheduleView />);
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('schedule-range-title')).toHaveTextContent('Tue 20 Oct');
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(distinctInputs()).toEqual([
      '2026-10-18T21:00:00.000Z/2026-10-25T22:00:00.000Z',
      '2026-10-25T22:00:00.000Z/2026-11-01T22:00:00.000Z',
    ]);
  });

  it('a block opens the booking detail; Add a booking opens the editor at the next hour', () => {
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: /^Tuesday 18:00 to 19:00, Maria/ }));
    expect(m.push).toHaveBeenCalledWith('/trainer/bookings/b1');
    fireEvent.click(screen.getByRole('button', { name: 'Add a booking' }));
    expect(m.editorTarget).toEqual({ mode: 'create', date: '2026-10-20', time: '16:00' });
  });

  it('offline: the cached week stays with "Last updated"', () => {
    m.online = false;
    render(<ScheduleView />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'You’re offline. Adding and changing bookings needs a connection.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Last updated 14:30');
    expect(screen.getAllByTestId('schedule-block')).toHaveLength(1);
  });
});
