// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { HistoryList } from './HistoryList';

// UX-GYM-33: "Load more" is shown only when an older session exists.

const m = vi.hoisted(() => {
  const probe: { data: { items: unknown[]; nextCursor: string | null } | undefined } = {
    data: undefined,
  };
  return { probe, useQuery: vi.fn() };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      gym: {
        bootstrap: {
          cancel: () => Promise.resolve(),
          setData: vi.fn(),
          invalidate: () => Promise.resolve(),
        },
        session: { list: { fetch: vi.fn() } },
      },
    }),
    gym: {
      session: {
        list: {
          useQuery: (...args: unknown[]) => {
            m.useQuery(...args);
            return m.probe;
          },
        },
      },
    },
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
vi.mock('../shared/gym-toast', () => ({ showGymToast: vi.fn() }));

function session(id: string): SessionSummaryDto {
  return {
    id,
    name: 'Full Body A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: '2026-09-10',
    startedAt: '2026-09-10T18:00:00.000Z',
    finishedAt: '2026-09-10T18:50:00.000Z',
    isDeload: false,
    exercises: [],
  };
}

function bootstrap(): GymBootstrap {
  return { recentSessions: [session('s1')] } as unknown as GymBootstrap;
}

beforeEach(() => {
  m.useQuery.mockClear();
  m.probe = { data: undefined };
});
afterEach(cleanup);

describe('HistoryList — Load more', () => {
  it('hides Load more when the probe past the cached window finds nothing', () => {
    m.probe = { data: { items: [], nextCursor: null } };
    render(<HistoryList data={bootstrap()} />);
    expect(screen.getByTestId('gym-history-row-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('gym-history-load-more')).toBeNull();
    expect(m.useQuery).toHaveBeenCalledWith(
      { cursor: '2026-09-10T18:00:00.000Z|s1', limit: 1 },
      { enabled: true },
    );
  });

  it('keeps Load more while unknown, and when something older exists', () => {
    render(<HistoryList data={bootstrap()} />);
    expect(screen.getByTestId('gym-history-load-more')).toBeInTheDocument();
    cleanup();

    m.probe = { data: { items: [session('older')], nextCursor: null } };
    render(<HistoryList data={bootstrap()} />);
    expect(screen.getByTestId('gym-history-load-more')).toBeInTheDocument();
  });
});
