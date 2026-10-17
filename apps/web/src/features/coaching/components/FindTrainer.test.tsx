// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerSummaryDto } from '@chefer/types';
import { COACHING_COPY } from '@chefer/types';
import { FindTrainer } from './FindTrainer';

const m = vi.hoisted(
  (): {
    calls: { input: { query: string }; enabled: boolean }[];
    results: Record<string, TrainerSummaryDto[]>;
  } => ({ calls: [], results: {} }),
);

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    coaching: {
      findTrainers: {
        useInfiniteQuery: (input: { query: string }, opts: { enabled: boolean }) => {
          m.calls.push({ input, enabled: opts.enabled });
          const items = opts.enabled ? (m.results[input.query] ?? []) : [];
          return {
            data: opts.enabled ? { pages: [{ items, nextCursor: null }] } : undefined,
            isLoading: false,
            isError: false,
            isSuccess: opts.enabled,
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          };
        },
      },
    },
  },
}));

const lastEnabledQuery = () => m.calls.filter((c) => c.enabled).at(-1)?.input.query;

beforeEach(() => {
  vi.useFakeTimers();
  m.calls = [];
  m.results = {
    Ana: [
      { trainerId: 't1', name: 'Ana Pop', gymLine: 'Iron Gym, Cluj', acceptingClients: true },
      { trainerId: 't2', name: 'Ana Ionescu', gymLine: null, acceptingClients: false },
    ],
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function type(value: string) {
  fireEvent.change(screen.getByLabelText(COACHING_COPY.find.searchLabel), {
    target: { value },
  });
}

describe('FindTrainer', () => {
  it('has a labelled search field and one page heading', () => {
    render(<FindTrainer />);
    expect(screen.getByRole('heading', { level: 1, name: 'Find a trainer' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search trainers by name' })).toBeInTheDocument();
  });

  it('asks for 2 letters and does not search before that', () => {
    render(<FindTrainer />);
    type('A');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('Type at least 2 letters.')).toBeInTheDocument();
    expect(lastEnabledQuery()).toBeUndefined();
  });

  it('searches once typing pauses and lists trainers with badge, gym line and capacity', () => {
    render(<FindTrainer />);
    type('An');
    type('Ana');
    expect(lastEnabledQuery()).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(lastEnabledQuery()).toBe('Ana');

    const rows = screen.getAllByTestId('find-trainer-result');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/coaching/trainers/t1');
    expect(within(rows[0]!).getByText('Ana Pop')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Trainer')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Iron Gym, Cluj')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Not taking new clients')).toBeNull();
    expect(within(rows[1]!).getByText('Not taking new clients')).toBeInTheDocument();
  });

  it('says so when nobody matches', () => {
    render(<FindTrainer />);
    type('Zed');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText(COACHING_COPY.find.empty)).toBeInTheDocument();
  });
});
