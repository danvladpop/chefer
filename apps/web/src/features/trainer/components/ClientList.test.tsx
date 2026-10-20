// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRowDto } from '@chefer/types';
import { ClientList } from './ClientList';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const maria: ClientRowDto = {
  clientId: 'c1',
  name: 'Maria Popescu',
  since: '2026-09-20T09:00:00.000Z',
  label: 'Maria, Tue/Thu',
  lastWorkoutDate: '2026-09-30',
  week: { sessions: 2, goal: 3 },
  inactiveDays: 4,
  routineChangedByClientAt: '2026-10-03T12:00:00.000Z',
};

describe('ClientList', () => {
  it('shows the empty state', () => {
    render(<ClientList clients={[]} />);
    expect(screen.getByText('Invite your first client')).toBeInTheDocument();
  });

  it('shows name, label, last workout, week progress and the client-changed line', () => {
    render(<ClientList clients={[maria]} />);
    const row = screen.getByTestId('trainer-client-row');
    expect(row).toHaveAttribute('href', '/trainer/c1');
    expect(within(row).getByText('Maria Popescu')).toBeInTheDocument();
    expect(within(row).getByText('Maria, Tue/Thu')).toBeInTheDocument();
    expect(within(row).getByText('Last workout Wed 30 Sep')).toBeInTheDocument();
    expect(within(row).getByText('2 / 3 this week')).toBeInTheDocument();
    expect(within(row).getByTestId('trainer-client-changed')).toHaveTextContent(
      'Routine changed by Maria · 3 Oct',
    );
    expect(within(row).queryByTestId('trainer-client-quiet')).toBeNull();
  });

  it('shows the next booking line (M3) only when there is one', () => {
    // The label is relative to today ("Today, 18:00" on the day itself): pin the clock before it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T09:00:00.000Z'));
    render(<ClientList clients={[maria]} />);
    expect(screen.queryByTestId('trainer-client-next-booking')).toBeNull();
    cleanup();
    render(<ClientList clients={[{ ...maria, nextBookingAt: '2026-10-20T15:00:00.000Z' }]} />);
    expect(screen.getByTestId('trainer-client-next-booking')).toHaveTextContent(
      'Next booking: Tue 20 Oct, 18:00',
    );
  });

  it('flags a client who logged nothing for 7 days, and a client with no workout yet', () => {
    render(
      <ClientList
        clients={[
          { ...maria, inactiveDays: 7, routineChangedByClientAt: null },
          {
            ...maria,
            clientId: 'c2',
            name: 'Ion',
            label: null,
            lastWorkoutDate: null,
            inactiveDays: 2,
            routineChangedByClientAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('trainer-client-quiet')).toHaveTextContent(
      'Nothing logged for 7 days',
    );
    expect(screen.getByText('No workout yet')).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-client-changed')).toBeNull();
  });

  it('badges a client who trains in Keep it simple, and only that client', () => {
    render(
      <ClientList
        clients={[
          { ...maria, keepItSimple: true },
          { ...maria, clientId: 'c2', name: 'Ion', keepItSimple: false },
        ]}
      />,
    );
    const [simple, other] = screen.getAllByTestId('trainer-client-row');
    expect(within(simple!).getByTestId('trainer-client-simple')).toHaveTextContent(
      'Keep it simple',
    );
    expect(within(other!).queryByTestId('trainer-client-simple')).toBeNull();
  });
});
