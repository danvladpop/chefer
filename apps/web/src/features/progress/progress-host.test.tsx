// @vitest-environment jsdom
import { AppToastHost, resetAppToastForTests } from '@/lib/app-toast';
import {
  progressMock,
  receiptFixture,
  resetProgressMock,
  summaryFixture,
} from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROGRESS_SETTINGS, type ProgressInbox } from '@chefer/types';
import { ProgressHost } from './progress-host';

vi.mock('@/lib/trpc', () =>
  import('@/test-support/progress-fixtures').then((m) => m.progressTrpcMock),
);

const CURSOR = new Date('2026-10-22T10:00:00Z');
const levelUp = {
  from: 7,
  to: 8,
  rank: { id: 'LINE_COOK' as const, title: 'Line Cook', minLevel: 5 },
  rankChanged: false,
};
const fullDay = receiptFixture({
  id: 'r-fd',
  kind: 'FULL_DAY',
  xp: 15,
  lines: [{ code: 'FULL_DAY', xp: 15 }],
});

function inboxWith(overrides: Partial<ProgressInbox>): ProgressInbox {
  return { receipts: [fullDay], unlocks: [], levelUp: null, cursor: CURSOR, ...overrides };
}

function setCelebrations(celebrations: 'FULL' | 'SUBTLE' | 'OFF') {
  progressMock.summary = summaryFixture({
    settings: { ...DEFAULT_PROGRESS_SETTINGS, celebrations },
  });
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  resetProgressMock();
  resetAppToastForTests();
});
afterEach(() => {
  cleanup();
  resetAppToastForTests();
});

function renderHost() {
  return render(
    <>
      <ProgressHost />
      <AppToastHost />
    </>,
  );
}

describe('ProgressHost', () => {
  it('FULL: toasts the receipt, opens the level-up modal and acks', () => {
    setCelebrations('FULL');
    progressMock.inbox = inboxWith({ levelUp });
    renderHost();
    expect(screen.getByRole('status').textContent).toContain('+15 XP · Full day logged');
    const modal = screen.getByTestId('level-up-modal');
    expect(modal.textContent).toContain('Lv 8 · Line Cook');
    expect(progressMock.mutate.ack).toHaveBeenCalledTimes(1);
    expect(progressMock.mutate.ack).toHaveBeenCalledWith({ upTo: CURSOR, unlockIds: [], level: 8 });

    // "Keep cooking" closes it (the sheet then animates out and unmounts).
    fireEvent.click(screen.getByRole('button', { name: 'Keep cooking' }));
    expect(document.querySelector('[role="dialog"]')?.getAttribute('data-state')).toBe('closed');
  });

  it('SUBTLE: toasts only, including the level-up', () => {
    setCelebrations('SUBTLE');
    progressMock.inbox = inboxWith({ levelUp });
    renderHost();
    expect(screen.queryByTestId('level-up-modal')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Level up: Lv 8');
    expect(progressMock.mutate.ack).toHaveBeenCalledTimes(1);
  });

  it('OFF: shows nothing but still acks, so nothing piles up', () => {
    setCelebrations('OFF');
    progressMock.inbox = inboxWith({ levelUp });
    renderHost();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('level-up-modal')).toBeNull();
    expect(progressMock.mutate.ack).toHaveBeenCalledTimes(1);
  });

  it('handles each batch once, even across re-renders', () => {
    setCelebrations('FULL');
    progressMock.inbox = inboxWith({});
    const { rerender } = renderHost();
    rerender(
      <>
        <ProgressHost />
        <AppToastHost />
      </>,
    );
    expect(progressMock.mutate.ack).toHaveBeenCalledTimes(1);
  });

  it('does nothing, and asks for nothing, while the flag is off', () => {
    progressMock.flags = { gamification: false };
    progressMock.inbox = inboxWith({ levelUp });
    renderHost();
    expect(progressMock.queries['inbox']).toBeUndefined();
    expect(progressMock.mutate.ack).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
