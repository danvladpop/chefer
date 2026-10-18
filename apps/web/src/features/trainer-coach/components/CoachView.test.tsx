// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachStartDto, TrainerBookingDto } from '@chefer/types';
import { booking, coachStart } from '../test-fixtures';
import { CoachView } from './CoachView';

const m = vi.hoisted(() => {
  const state: { booking: { data: TrainerBookingDto | undefined } } = {
    booking: { data: undefined },
  };
  const utils = {
    client: {
      trainer: {
        coach: { start: { mutate: vi.fn() }, sync: { mutate: vi.fn() } },
      },
    },
    trainer: { invalidate: vi.fn(() => Promise.resolve()) },
  };
  return { state, utils, replace: vi.fn(), capture: vi.fn() };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => m.utils,
    trainer: {
      bookings: {
        get: {
          useQuery: () => ({
            data: m.state.booking.data,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          }),
        },
      },
    },
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: m.replace, push: vi.fn(), back: vi.fn() }),
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
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'ana' } }) }));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));

const start = m.utils.client.trainer.coach.start.mutate;
const sync = m.utils.client.trainer.coach.sync.mutate;

const STARTS: Record<string, CoachStartDto> = {
  maria: coachStart('maria', 'Maria Pop'),
  tom: coachStart('tom', 'Tom Ionescu'),
};

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  window.localStorage.clear();
  vi.clearAllMocks();
  start.mockImplementation(({ clientId }: { clientId: string }) =>
    Promise.resolve(STARTS[clientId]),
  );
  sync.mockImplementation(({ docs }: { docs: { id: string }[] }) =>
    Promise.resolve({ results: docs.map((d) => ({ id: d.id, status: 'applied' })) }),
  );
  m.state.booking.data = undefined;
});
afterEach(cleanup);

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const tickFirstSet = async () => {
  const [first] = await screen.findAllByRole('button', { name: /^Log set/ });
  if (first) fireEvent.click(first);
};

type SyncInput = { clientId: string; docs: Record<string, unknown>[] };
/** The n-th `trainer.coach.sync` input. */
const syncInput = (n: number): SyncInput | undefined =>
  (sync.mock.calls as unknown as [SyncInput][])[n]?.[0];

describe('CoachView — group booking', () => {
  it('starts each client lazily, keeps their sets while switching, finishes everyone', async () => {
    m.state.booking.data = booking([
      { clientId: 'maria', name: 'Maria Pop' },
      { clientId: 'tom', name: 'Tom Ionescu' },
    ]);
    render(<CoachView bookingId="b1" clientId={null} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Coaching Maria' }),
    ).toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'maria', bookingId: 'b1' }),
    );
    expect(m.capture).toHaveBeenCalledWith('coached_workout_started', { group: true });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(tab(/Maria/)).toHaveAttribute('aria-selected', 'true');
    // Last time comes from the client's prescription.
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();

    await tickFirstSet();
    expect(within(tab(/Maria/)).getByText('1/6')).toBeInTheDocument();

    fireEvent.click(tab(/Tom/));
    expect(await screen.findByRole('heading', { name: 'Coaching Tom' })).toBeInTheDocument();
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ clientId: 'tom' }));
    expect(await within(tab(/Tom/)).findByText('0/6')).toBeInTheDocument();

    fireEvent.click(tab(/Maria/));
    expect(await screen.findByRole('heading', { name: 'Coaching Maria' })).toBeInTheDocument();
    expect(within(tab(/Maria/)).getByText('1/6')).toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(2); // switching back never restarts

    // A reload keeps the sets: they are in localStorage under the booking.
    expect(window.localStorage.getItem('chefer.trainer-coach.booking.b1')).toContain('"tom"');

    fireEvent.click(screen.getByTestId('coach-finish'));
    expect(await screen.findByTestId('coach-finish-this')).toHaveTextContent(
      'Finish Maria’s workout',
    );
    expect(screen.getByText(/Tom has no sets ticked/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('coach-finish-all'));

    await waitFor(() => expect(m.replace).toHaveBeenCalledWith('/trainer/bookings/b1'));
    expect(sync).toHaveBeenCalledTimes(1);
    const input = syncInput(0);
    expect(input?.clientId).toBe('maria');
    expect(input?.docs[0]).toMatchObject({ status: 'COMPLETED', bookingId: 'b1' });
    expect(input?.docs[0]).not.toHaveProperty('loggedById');
    expect(m.capture).toHaveBeenCalledWith('coached_workout_finished', {});
    expect(window.localStorage.getItem('chefer.trainer-coach.booking.b1')).toBeNull();
  });

  it('finish this: only that client is saved and the other keeps training', async () => {
    m.state.booking.data = booking([
      { clientId: 'maria', name: 'Maria Pop' },
      { clientId: 'tom', name: 'Tom Ionescu' },
    ]);
    render(<CoachView bookingId="b1" clientId="tom" />);
    expect(await screen.findByRole('heading', { name: 'Coaching Tom' })).toBeInTheDocument();
    fireEvent.click(tab(/Maria/));
    await screen.findByRole('heading', { name: 'Coaching Maria' });
    await tickFirstSet();

    fireEvent.click(screen.getByTestId('coach-finish'));
    fireEvent.click(await screen.findByTestId('coach-finish-this'));

    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(syncInput(0)?.clientId).toBe('maria');
    expect(await screen.findByRole('heading', { name: 'Coaching Tom' })).toBeInTheDocument();
    expect(m.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(within(tab(/Maria/)).getByText(', done')).toBeInTheDocument());
  });
});

describe('CoachView — one client, no booking', () => {
  it('logs for the client and returns to client detail; a failed sync keeps it and retries', async () => {
    sync.mockRejectedValueOnce(new Error('Failed to fetch'));
    render(<CoachView bookingId={null} clientId="maria" />);
    expect(await screen.findByRole('heading', { name: 'Coaching Maria' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(m.capture).toHaveBeenCalledWith('coached_workout_started', { group: false });
    await tickFirstSet();

    fireEvent.click(screen.getByTestId('coach-finish'));
    expect(screen.queryByTestId('coach-finish-all')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('coach-finish-this'));

    const retry = await screen.findByTestId('coach-sync');
    expect(retry).toHaveTextContent('1 workout waiting to upload');
    expect(m.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('chefer.trainer-coach.client.maria')).toContain('COMPLETED');
    expect(syncInput(0)?.docs[0]?.['bookingId']).toBeNull();

    await act(async () => {
      fireEvent.click(retry);
      await Promise.resolve();
    });
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith('/trainer/maria'));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('a client with no routine: says so and links to their routine', async () => {
    start.mockResolvedValueOnce(coachStart('maria', 'Maria Pop', { workout: null }));
    render(<CoachView bookingId={null} clientId="maria" />);
    expect(await screen.findByText('Maria has no routine yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Set up Maria’s routine/ })).toHaveAttribute(
      'href',
      '/trainer/maria/routine',
    );
    expect(screen.queryByTestId('coach-finish')).not.toBeInTheDocument();
    expect(m.capture).not.toHaveBeenCalledWith('coached_workout_started', expect.anything());
  });
});
