// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRowDto } from '@chefer/types';
import { TrainerClients } from './TrainerClients';

const m = vi.hoisted(() => ({ rows: [] as ClientRowDto[] }));

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
      clients: {
        list: {
          useQuery: () => ({ isLoading: false, isError: false, data: m.rows, refetch: vi.fn() }),
        },
      },
    },
  },
}));
vi.mock('@/features/trainer/components/TrainerRequests', () => ({
  TrainerRequests: () => <section id="trainer-requests" data-testid="requests" />,
}));
vi.mock('@/features/trainer/components/InvitesSection', () => ({
  InvitesSection: () => <section data-testid="invites" />,
}));
vi.mock('@/features/trainer/components/InviteSheet', () => ({
  InviteSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Invite a client" /> : null,
}));

afterEach(cleanup);

function client(n: number, name: string, lastWorkoutDate: string | null): ClientRowDto {
  return {
    clientId: `c${n}`,
    name,
    since: '2026-09-20T09:00:00.000Z',
    label: null,
    lastWorkoutDate,
    week: { sessions: 0, goal: 3 },
    inactiveDays: 1,
    routineChangedByClientAt: null,
  };
}

const NAMES = ['Zoe', 'Ana', 'Maria Pop', 'Ion', 'Dan', 'Eva', 'Radu', 'Bianca'];
const names = () => screen.getAllByTestId('trainer-client-row').map((r) => r.textContent);

describe('TrainerClients', () => {
  it('has one h1, the capacity line, requests first and an Invite button that opens the sheet', () => {
    m.rows = [client(1, 'Ana', null), client(2, 'Zoe', null)];
    render(<TrainerClients />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('trainer-clients-capacity')).toHaveTextContent('2 of 50 clients');
    expect(screen.getByTestId('requests')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Invite a client' }));
    expect(screen.getByRole('dialog', { name: 'Invite a client' })).toBeInTheDocument();
  });

  it('has no search below 8 clients', () => {
    m.rows = NAMES.slice(0, 7).map((n, i) => client(i, n, null));
    render(<TrainerClients />);
    expect(screen.queryByLabelText('Search clients')).toBeNull();
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
  });

  it('searches from 8 clients, by name prefix, and says when nothing matches', () => {
    m.rows = NAMES.map((n, i) => client(i, n, null));
    render(<TrainerClients />);
    const search = screen.getByLabelText('Search clients');
    fireEvent.change(search, { target: { value: 'ma po' } });
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Maria Pop');
    fireEvent.change(search, { target: { value: 'xyz' } });
    expect(screen.queryAllByTestId('trainer-client-row')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('No client matches “xyz”.');
  });

  it('sorts by name, or by last workout with never-trained clients last', () => {
    m.rows = [
      client(1, 'Zoe', '2026-10-15'),
      client(2, 'Ana', null),
      client(3, 'Ion', '2026-10-01'),
    ];
    render(<TrainerClients />);
    expect(names().map((n) => n.slice(0, 3))).toEqual(['Ana', 'Ion', 'Zoe']);
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'lastWorkout' } });
    expect(names().map((n) => n.slice(0, 3))).toEqual(['Zoe', 'Ion', 'Ana']);
  });
});
