import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@chefer/database';
import { CoachingNoticeService } from './coaching-notice.service.js';

// Coaching notices (PRD 2026-10 §4.2, §4.3) on the Notification table.

const NOW = new Date('2026-10-17T12:00:00Z');
const CLIENT = 'cclient000000000000000001';
const TRAINER = 'ctrainer00000000000000001';

function row(over: Partial<Notification>): Notification {
  return {
    id: 'n1',
    userId: CLIENT,
    kind: 'COACHING_ROUTINE_UPDATED',
    actorId: TRAINER,
    createdAt: NOW,
    readAt: null,
    payload: null,
    ...over,
  };
}

function setup(existing: Notification | null = null, listed: Notification[] = []) {
  const notifications = {
    findCoaching: vi.fn(async () => existing),
    upsertCoaching: vi.fn(async () => row({})),
    listCoaching: vi.fn(async () => listed),
    markCoachingRead: vi.fn(async () => true),
    withdrawCoaching: vi.fn(async () => 1),
  };
  const service = new CoachingNoticeService({
    notifications,
    trainers: {
      findMany: vi.fn(async () => [
        { userId: TRAINER, displayName: 'Ana', gymLine: null, activatedAt: NOW, disabledAt: null },
      ]),
    },
    users: {
      findUsers: vi.fn(async () => [
        { id: CLIENT, firstName: 'Ioana', lastName: 'M', name: null, image: null },
      ]),
    },
    now: () => NOW,
  });
  return { service, notifications };
}

describe('routineUpdated', () => {
  it('folds new changes into the unread card', async () => {
    const { service, notifications } = setup(
      row({
        payload: {
          role: 'TRAINER',
          changes: [{ kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' }],
        },
      }),
    );
    await service.routineUpdated(CLIENT, TRAINER, 'TRAINER', [
      { kind: 'changed', exercise: 'Squat', from: '4×6', to: '5×5' },
      { kind: 'added', exercise: 'Romanian deadlift' },
    ]);
    expect(notifications.upsertCoaching).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'COACHING_ROUTINE_UPDATED',
      actorId: TRAINER,
      payload: {
        role: 'TRAINER',
        changes: [
          { kind: 'changed', exercise: 'Squat', from: '3×8', to: '5×5' },
          { kind: 'added', exercise: 'Romanian deadlift' },
        ],
      },
    });
  });

  it('a dismissed card starts a fresh list', async () => {
    const { service, notifications } = setup(
      row({ readAt: NOW, payload: { role: 'TRAINER', changes: [{ kind: 'schedule' }] } }),
    );
    await service.routineUpdated(CLIENT, TRAINER, 'TRAINER', [{ kind: 'note', exercise: 'Bench' }]);
    expect(notifications.upsertCoaching).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { role: 'TRAINER', changes: [{ kind: 'note', exercise: 'Bench' }] },
      }),
    );
  });

  it('an edit that undoes the unread change removes the card', async () => {
    const { service, notifications } = setup(
      row({
        payload: { role: 'TRAINER', changes: [{ kind: 'added', exercise: 'Lunge' }] },
      }),
    );
    await service.routineUpdated(CLIENT, TRAINER, 'TRAINER', [
      { kind: 'removed', exercise: 'Lunge' },
    ]);
    expect(notifications.upsertCoaching).not.toHaveBeenCalled();
    expect(notifications.withdrawCoaching).toHaveBeenCalledWith(
      CLIENT,
      'COACHING_ROUTINE_UPDATED',
      TRAINER,
    );
  });

  it('nothing changed, or your own edit: no card', async () => {
    const { service, notifications } = setup();
    await service.routineUpdated(CLIENT, TRAINER, 'TRAINER', []);
    await service.routineUpdated(CLIENT, CLIENT, 'CLIENT', [{ kind: 'schedule' }]);
    expect(notifications.upsertCoaching).not.toHaveBeenCalled();
  });

  it('a failed write never fails the save that caused it', async () => {
    const { service, notifications } = setup();
    notifications.upsertCoaching.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      service.routineUpdated(CLIENT, TRAINER, 'TRAINER', [{ kind: 'schedule' }]),
    ).resolves.toBeUndefined();
    expect(String(warn.mock.calls[0])).not.toContain(CLIENT);
    warn.mockRestore();
  });
});

describe('ended', () => {
  it('a deleted trainer: the notice is the client’s own row, the name kept in the payload', async () => {
    const { service, notifications } = setup();
    await service.ended(CLIENT, TRAINER, 'TRAINER', 'SYSTEM', { otherGoneName: 'Ana' });
    expect(notifications.upsertCoaching).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'COACHING_ENDED',
      actorId: CLIENT,
      payload: { role: 'TRAINER', endedBy: 'SYSTEM', goneName: 'Ana' },
    });
  });

  it('withdraws a stale "updated your routine" card from them', async () => {
    const { service, notifications } = setup();
    await service.ended(CLIENT, TRAINER, 'TRAINER', 'TRAINER');
    expect(notifications.withdrawCoaching).toHaveBeenCalledWith(
      CLIENT,
      'COACHING_ROUTINE_UPDATED',
      TRAINER,
    );
  });
});

describe('list', () => {
  it('resolves live names by role, and the kept name for a gone account; skips unreadable rows', async () => {
    const { service } = setup(null, [
      row({
        id: 'a',
        payload: { role: 'TRAINER', changes: [{ kind: 'added', exercise: 'Squat' }] },
      }),
      row({
        id: 'b',
        kind: 'COACHING_ENDED',
        actorId: CLIENT,
        readAt: NOW,
        payload: { role: 'TRAINER', endedBy: 'SYSTEM', goneName: 'Ana' },
      }),
      row({
        id: 'c',
        kind: 'COACHING_REQUEST',
        userId: TRAINER,
        actorId: CLIENT,
        payload: { role: 'CLIENT' },
      }),
      row({ id: 'd', payload: { nonsense: true } }),
    ]);
    expect(await service.list(CLIENT)).toEqual([
      {
        id: 'a',
        kind: 'ROUTINE_UPDATED',
        at: NOW.toISOString(),
        read: false,
        other: { id: TRAINER, name: 'Ana', role: 'TRAINER' },
        changes: [{ kind: 'added', exercise: 'Squat' }],
      },
      {
        id: 'b',
        kind: 'COACHING_ENDED',
        at: NOW.toISOString(),
        read: true,
        other: { id: null, name: 'Ana', role: 'TRAINER' },
        endedBy: 'SYSTEM',
      },
      {
        id: 'c',
        kind: 'REQUEST_RECEIVED',
        at: NOW.toISOString(),
        read: false,
        other: { id: CLIENT, name: 'Ioana M', role: 'CLIENT' },
      },
    ]);
  });
});
