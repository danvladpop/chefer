import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymBootstrap, SessionSummaryDto, SyncResultDto } from '@chefer/types';
import { addDaysLocal, weekStartOf } from '@chefer/utils';
import { localDate } from '../use-gym-bootstrap';
import { outbox } from './outbox';
import { resetGymOwnerForTests, setGymOwner } from './owner';
import {
  deleteConfirmLines,
  deleteSessionWithUndo,
  markHardDeletesAcked,
  processPendingHardDeletes,
  resetSessionCorrectionsForTests,
  UNDO_WINDOW_MS,
  type DeleteUtils,
} from './session-corrections';
import { createMemoryStorage, setStorageForTests } from './storage';

// The Undo toast is recorded instead of rendered.
const toasts = vi.hoisted(() => ({
  shown: [] as { message: string; actionLabel?: string; onAction?: () => void }[],
}));
vi.mock('../shared/gym-toast', () => ({
  showGymToast: (t: { message: string; actionLabel?: string; onAction?: () => void }) => {
    toasts.shown.push(t);
  },
}));
const GymToastSpy = {
  reset: () => {
    toasts.shown.length = 0;
  },
  last: () => toasts.shown.at(-1),
};

// UX-44 (T-44.5, AC4) on the web: the confirm names what changes, Undo within
// 8 s sends nothing, after 8 s the tombstone syncs and is then hard-deleted.

const ID = '00000000-0000-4000-8000-0000000000d1';
const TODAY = localDate();

function session(over: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    id: ID,
    name: 'Full Body A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: TODAY,
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    finishedAt: new Date(Date.now() - 600_000).toISOString(),
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 2,
        sets: [
          { weightKg: 40, reps: 10, isWarmup: true, completed: true },
          { weightKg: 60, reps: 8, isWarmup: false, completed: true },
          { weightKg: 60, reps: 6, isWarmup: false, completed: false },
        ],
      },
    ],
    ...over,
  };
}

function bootstrap(sessions: SessionSummaryDto[], thisWeek = 2): GymBootstrap {
  return {
    recentSessions: sessions,
    weeks: [
      { weekStart: weekStartOf(TODAY), goal: 2, sessions: thisWeek, status: 'met', flexTokens: 0 },
    ],
    streak: { current: 1, best: 1, flexTokens: 0, thisWeekSessions: thisWeek, thisWeekGoal: 2 },
    progressions: [],
    engineVersion: 1,
  } as unknown as GymBootstrap;
}

function fakeUtils(initial: GymBootstrap) {
  let data: GymBootstrap | undefined = initial;
  const utils: DeleteUtils = {
    gym: {
      bootstrap: {
        cancel: () => Promise.resolve(),
        setData: (_input, updater) => {
          data = updater(data);
        },
        invalidate: () => Promise.resolve(),
      },
    },
  };
  return { utils, get: () => data };
}

const acking = () =>
  vi.fn((docs: { id: string }[]) =>
    Promise.resolve(docs.map((d): SyncResultDto => ({ id: d.id, status: 'applied' }))),
  );

beforeEach(() => {
  vi.useFakeTimers();
  setStorageForTests(createMemoryStorage());
  resetGymOwnerForTests();
  setGymOwner('user-a');
  outbox.reload();
  outbox.configure(null);
  resetSessionCorrectionsForTests();
  GymToastSpy.reset();
});
afterEach(() => {
  outbox.configure(null);
  vi.useRealTimers();
  setStorageForTests(null);
});

describe('deleteConfirmLines (AC4)', () => {
  it('names the workout, its sets, and only the week/streak lines that change', () => {
    const lines = deleteConfirmLines(session(), bootstrap([session()], 2), TODAY);
    expect(lines[0]).toMatch(/^Full Body A on .*: 1 set\.$/);
    expect(lines).toContain('This week goes from 2 to 1 session.');
    expect(lines).toContain('Your streak goes from 1 week to 0.');
    expect(lines.at(-1)).toBe('Next time targets for its exercises are worked out again.');
  });

  it('leaves the week and streak lines out when they do not move', () => {
    const old = session({ localDate: addDaysLocal(TODAY, -30) });
    const lines = deleteConfirmLines(old, bootstrap([old], 2), TODAY);
    expect(lines).toHaveLength(2);
  });
});

describe('deleteSessionWithUndo', () => {
  it('Undo within 8 s restores the row and nothing is ever sent', async () => {
    const send = acking();
    outbox.configure({ send });
    const { utils, get } = fakeUtils(bootstrap([session()]));

    await deleteSessionWithUndo({ utils, session: session(), engineVersion: 1, source: 'detail' });
    expect(get()?.recentSessions).toHaveLength(0);
    expect(outbox.getState().entries.map((e) => [e.doc.id, e.doc.status])).toEqual([
      [ID, 'DISCARDED'],
    ]);
    const toast = GymToastSpy.last();
    expect(toast?.message).toBe('Workout deleted');
    expect(toast?.actionLabel).toBe('Undo');

    await vi.advanceTimersByTimeAsync(3000);
    toast?.onAction?.();
    expect(outbox.getState().entries).toHaveLength(0);
    expect(get()?.recentSessions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('after 8 s the tombstone syncs, then the session is hard-deleted', async () => {
    const send = acking();
    outbox.configure({
      send,
      onSynced: (ids) => markHardDeletesAcked(ids),
    });
    const hardDelete = vi.fn(() => Promise.resolve());
    const { utils } = fakeUtils(bootstrap([session()]));
    await deleteSessionWithUndo({ utils, session: session(), engineVersion: 1, source: 'recent' });

    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1000);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject([{ id: ID, status: 'DISCARDED' }]);

    await processPendingHardDeletes(hardDelete);
    expect(hardDelete).toHaveBeenCalledWith(ID);
    // Done once: a second pass has nothing left to delete.
    await processPendingHardDeletes(hardDelete);
    expect(hardDelete).toHaveBeenCalledTimes(1);
  });

  it('never hard-deletes a session whose tombstone was not acked', async () => {
    const hardDelete = vi.fn(() => Promise.resolve());
    const { utils } = fakeUtils(bootstrap([session()]));
    await deleteSessionWithUndo({ utils, session: session(), engineVersion: 1, source: 'recent' });
    await processPendingHardDeletes(hardDelete);
    expect(hardDelete).not.toHaveBeenCalled();
  });
});
