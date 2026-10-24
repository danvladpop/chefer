// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRowDto } from '@chefer/types';
import { ClientList } from './ClientList';
import { TrainerAlertsSettings } from './TrainerAlertsSettings';

// Lane K4 on web: the alerts settings and the Clients list's quiet verdict
// (mobile twin: tests/unit/trainer-quiet.test.tsx).

const m = vi.hoisted(() => ({
  save: vi.fn(),
  // Stable, like react-query's data: a new object per render would re-run the effect forever.
  config: { data: { quietAfterDays: 3, digestEmail: false } },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      trainer: {
        alerts: { config: { invalidate: vi.fn() } },
        dashboard: { summary: { invalidate: vi.fn() } },
        clients: { list: { invalidate: vi.fn() } },
        badges: { invalidate: vi.fn() },
      },
    }),
    trainer: {
      alerts: {
        config: { useQuery: () => m.config },
        saveConfig: { useMutation: () => ({ mutate: m.save, isPending: false }) },
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (over: Partial<ClientRowDto> = {}): ClientRowDto => ({
  clientId: 'c1',
  name: 'Maria Pop',
  since: '2026-10-01T09:00:00.000Z',
  label: null,
  lastWorkoutDate: '2026-10-19',
  week: { sessions: 0, goal: 3 },
  inactiveDays: 3,
  routineChangedByClientAt: null,
  ...over,
});

describe('Client alerts (lane K4)', () => {
  it('saves N and the digest switch', () => {
    render(<TrainerAlertsSettings />);
    fireEvent.click(screen.getByRole('button', { name: '5 days' }));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(m.save).toHaveBeenCalledWith({ quietAfterDays: 5, digestEmail: true });
  });

  it('the Clients list follows the server verdict, else the old 7-day rule', () => {
    const { rerender } = render(<ClientList clients={[row({ quiet: true, quietDays: 3 })]} />);
    expect(screen.getByTestId('trainer-client-quiet')).toHaveTextContent(
      'Nothing logged for 3 days',
    );
    rerender(<ClientList clients={[row()]} />);
    expect(screen.queryByTestId('trainer-client-quiet')).toBeNull();
  });
});
