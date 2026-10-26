// @vitest-environment jsdom
import {
  progressMock,
  receiptFixture,
  resetProgressMock,
  summaryFixture,
} from '@/test-support/progress-fixtures';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrKind, WorkoutSessionDoc } from '@chefer/types';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { LivePrBanner, newLivePrs, WorkoutReceipt } from './workout-progress';

vi.mock('@/lib/trpc', () =>
  import('@/test-support/progress-fixtures').then((m) => m.progressTrpcMock),
);

const lookup = (id: string) =>
  id === 'bench'
    ? ({ id: 'bench', name: 'Bench press', loadType: 'WEIGHTED', perHand: false } as never)
    : undefined;

function docWithSet(reps: number): Pick<WorkoutSessionDoc, 'exercises'> {
  return {
    exercises: [{ id: 'se1', exerciseId: 'bench', sets: [{ id: 's1', weightKg: 80, reps }] }],
  } as never;
}

const PR: ReadonlyMap<string, { setId: string; kind: PrKind }> = new Map([
  ['se1', { setId: 's1', kind: 'weight' as const }],
]);
const NO_PRS: ReadonlyMap<string, { setId: string; kind: PrKind }> = new Map();

beforeEach(() => {
  vi.useFakeTimers();
  resetProgressMock();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('newLivePrs', () => {
  it('words a new best and only reports each PR once', () => {
    const seen = new Set<string>();
    const first = newLivePrs(PR, docWithSet(5), lookup, 'KG', seen);
    expect(first.map((p) => p.text)).toEqual(['New best · Bench press 80 kg × 5']);
    expect(newLivePrs(PR, docWithSet(5), lookup, 'KG', seen)).toEqual([]);
  });
});

describe('LivePrBanner', () => {
  const props = { doc: docWithSet(5), lookup, unit: 'KG' as const, ready: true };

  it('shows "New best" for 3 seconds when a tick sets a PR, not for PRs already there', () => {
    const { rerender } = render(<LivePrBanner prs={NO_PRS} {...props} />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();

    rerender(<LivePrBanner prs={PR} {...props} />);
    const banner = screen.getByTestId('live-pr-banner');
    expect(banner.textContent).toBe('New best · Bench press 80 kg × 5');
    expect(banner.getAttribute('role')).toBe('status');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });

  it('treats PRs present on the first pass (a resumed workout) as the baseline', () => {
    render(<LivePrBanner prs={PR} {...props} />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });

  it('waits for the PR history before it starts watching', () => {
    const { rerender } = render(<LivePrBanner prs={NO_PRS} {...props} ready={false} />);
    // The bootstrap arrives and the history says this is already a PR: not news.
    rerender(<LivePrBanner prs={PR} {...props} ready />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });

  it('stays quiet when celebrations are off or the gate is off', () => {
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, celebrations: 'OFF' },
    });
    const { rerender, unmount } = render(<LivePrBanner prs={NO_PRS} {...props} />);
    rerender(<LivePrBanner prs={PR} {...props} />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
    unmount();

    resetProgressMock();
    progressMock.flags = { gamification: false };
    const second = render(<LivePrBanner prs={NO_PRS} {...props} />);
    second.rerender(<LivePrBanner prs={PR} {...props} />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });
});

describe('WorkoutReceipt', () => {
  const doc = { id: 'w1', status: 'COMPLETED' as const };

  it('shows the receipt for a finished, synced workout', () => {
    progressMock.receiptFor = receiptFixture({
      kind: 'WORKOUT_COMPLETED',
      lines: [{ code: 'WORKOUT_DONE', xp: 30 }],
      xp: 30,
    });
    render(<WorkoutReceipt doc={doc} />);
    expect(screen.getByTestId('kitchen-receipt').textContent).toContain('Workout finished');
  });

  it('shows nothing before the workout has synced (no receipt yet), or while gated off', () => {
    progressMock.receiptFor = null;
    const { container, unmount } = render(<WorkoutReceipt doc={doc} />);
    expect(container.innerHTML).toBe('');
    unmount();

    progressMock.receiptFor = receiptFixture();
    progressMock.flags = { gamification: false };
    progressMock.queries = {};
    const second = render(<WorkoutReceipt doc={doc} />);
    expect(second.container.innerHTML).toBe('');
    expect(progressMock.queries['receiptFor']).toBeUndefined();
  });

  it('does not ask for a receipt for a workout still in progress', () => {
    render(<WorkoutReceipt doc={{ id: 'w1', status: 'IN_PROGRESS' }} />);
    expect(progressMock.queries['receiptFor']).toBeUndefined();
  });
});
