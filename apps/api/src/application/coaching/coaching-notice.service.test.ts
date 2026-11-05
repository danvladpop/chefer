import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@chefer/database';
import type { PushEnqueueOutcome } from '../notifications/push.service.js';
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
  const push = { enqueue: vi.fn(async (): Promise<PushEnqueueOutcome> => 'queued') };
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
    push,
    now: () => NOW,
  });
  return { service, notifications, push };
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

// Trainer mode M3 (trainer-mode.md §7.1, §9): booking and coached-workout notices.
describe('booking notices', () => {
  const ref = {
    bookingId: 'b1',
    startsAt: '2026-10-20T15:00:00.000Z',
    timeZone: 'Europe/Bucharest',
    weekly: true,
    reason: null,
  };

  it('writes the booking reference — never a name, a note or a location', async () => {
    const { service, notifications } = setup();
    await service.booking(CLIENT, TRAINER, 'CREATED', ref);
    expect(notifications.upsertCoaching).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'COACHING_BOOKING_CREATED',
      actorId: TRAINER,
      payload: { role: 'TRAINER', booking: ref },
    });
  });

  it('a cancel withdraws the unread "booked you" card of the same booking', async () => {
    const { service, notifications } = setup(
      row({ kind: 'COACHING_BOOKING_CREATED', payload: { role: 'TRAINER', booking: ref } }),
    );
    await service.booking(CLIENT, TRAINER, 'CANCELLED', { ...ref, reason: 'Sick' });
    expect(notifications.withdrawCoaching).toHaveBeenCalledWith(
      CLIENT,
      'COACHING_BOOKING_CREATED',
      TRAINER,
    );
  });

  it('coaching ended withdraws stale booking cards too', async () => {
    const { service, notifications } = setup();
    await service.ended(CLIENT, TRAINER, 'TRAINER', 'TRAINER');
    for (const kind of ['COACHING_BOOKING_CREATED', 'COACHING_BOOKING_CHANGED']) {
      expect(notifications.withdrawCoaching).toHaveBeenCalledWith(CLIENT, kind, TRAINER);
    }
  });

  it('below level 8 the new kinds are filtered out in the query; at 8 (and web) they are listed with their payload', async () => {
    const listed = [
      row({
        id: 'n2',
        kind: 'COACHING_BOOKING_CANCELLED',
        payload: { role: 'TRAINER', booking: { ...ref, reason: 'Sick' } },
      }),
      row({
        id: 'n3',
        kind: 'COACHING_WORKOUT_LOGGED',
        payload: { role: 'TRAINER', workoutSessionId: 's1' },
      }),
    ];
    const { service, notifications } = setup(null, listed);

    await service.list(CLIENT, 6);
    expect(notifications.listCoaching).toHaveBeenLastCalledWith(CLIENT, expect.any(Date), 30, [
      'COACHING_BOOKING_CREATED',
      'COACHING_BOOKING_CHANGED',
      'COACHING_BOOKING_CANCELLED',
      'COACHING_WORKOUT_LOGGED',
    ]);

    const out = await service.list(CLIENT, 8);
    expect(notifications.listCoaching).toHaveBeenLastCalledWith(CLIENT, expect.any(Date), 30, []);
    expect(out).toEqual([
      expect.objectContaining({
        id: 'n2',
        kind: 'BOOKING_CANCELLED',
        other: { id: TRAINER, name: 'Ana', role: 'TRAINER' },
        booking: { ...ref, reason: 'Sick' },
      }),
      expect.objectContaining({ id: 'n3', kind: 'COACHED_WORKOUT_LOGGED', workoutSessionId: 's1' }),
    ]);
    await service.list(CLIENT, Number.POSITIVE_INFINITY);
    expect(notifications.listCoaching).toHaveBeenLastCalledWith(CLIENT, expect.any(Date), 30, []);
  });
});

describe('push (trainer-mode.md §7.2): enqueued next to the notice, names and ids only', () => {
  const ref = {
    bookingId: 'b1',
    startsAt: '2026-10-21T15:00:00.000Z',
    timeZone: 'Europe/Bucharest',
    weekly: false,
    reason: null,
  };

  it('a request → the trainer, named by the client', async () => {
    const { service, push } = setup();
    await service.requestReceived(TRAINER, CLIENT);
    expect(push.enqueue).toHaveBeenCalledWith({
      userId: TRAINER,
      kind: 'COACHING_REQUEST_RECEIVED',
      actorId: CLIENT,
      payload: {
        title: 'New coaching request',
        body: 'Ioana M asked you to coach them',
        data: { clientId: CLIENT },
      },
    });
  });

  it('accepted / declined → the client, named by the trainer', async () => {
    const { service, push } = setup();
    await service.requestAnswered(CLIENT, TRAINER, true);
    await service.requestAnswered(CLIENT, TRAINER, false);
    expect(push.enqueue.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      expect.objectContaining({
        userId: CLIENT,
        kind: 'COACHING_REQUEST_ANSWERED',
        actorId: TRAINER,
        payload: { title: 'Coaching request accepted', body: 'Ana accepted your request' },
      }),
      expect.objectContaining({
        payload: { title: 'Coaching request declined', body: 'Ana declined your request' },
      }),
    ]);
  });

  it('routine changes push trainer → client only', async () => {
    const { service, push } = setup();
    await service.routineUpdated(TRAINER, CLIENT, 'CLIENT', [{ kind: 'schedule' }]);
    expect(push.enqueue).not.toHaveBeenCalled();
    await service.routineUpdated(CLIENT, TRAINER, 'TRAINER', [{ kind: 'schedule' }]);
    expect(push.enqueue).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'ROUTINE_CHANGED_BY_TRAINER',
      actorId: TRAINER,
      payload: { title: 'Routine updated', body: 'Ana updated your routine' },
    });
  });

  it('"ended coaching" pushes only to the trainer, only when the client ended it', async () => {
    const { service, push } = setup();
    await service.ended(CLIENT, TRAINER, 'TRAINER', 'TRAINER');
    await service.ended(TRAINER, CLIENT, 'CLIENT', 'SYSTEM');
    expect(push.enqueue).not.toHaveBeenCalled();
    await service.ended(TRAINER, CLIENT, 'CLIENT', 'CLIENT');
    expect(push.enqueue).toHaveBeenCalledWith({
      userId: TRAINER,
      kind: 'COACHING_ENDED_FOR_TRAINER',
      actorId: CLIENT,
      payload: {
        title: 'Coaching ended',
        body: 'Ioana M ended coaching',
        data: { clientId: CLIENT },
      },
    });
  });

  it('bookings: the time in the booking zone, the booking id — never a note or location', async () => {
    const { service, push } = setup();
    await service.booking(CLIENT, TRAINER, 'CREATED', ref);
    await service.booking(CLIENT, TRAINER, 'CHANGED', ref);
    await service.booking(CLIENT, TRAINER, 'CANCELLED', { ...ref, reason: 'Sick' });
    const payloads = push.enqueue.mock.calls.map(
      (c) => ((c as unknown[])[0] as { payload: unknown }).payload,
    );
    expect(payloads).toEqual([
      {
        title: 'New booking',
        body: 'Ana booked you for Wed 21 Oct, 18:00',
        data: { bookingId: 'b1' },
      },
      {
        title: 'Booking changed',
        body: 'Ana moved your booking to Wed 21 Oct, 18:00',
        data: { bookingId: 'b1' },
      },
      {
        title: 'Booking cancelled',
        body: 'Ana cancelled your booking on Wed 21 Oct, 18:00',
        data: { bookingId: 'b1' },
      },
    ]);
    expect(JSON.stringify(payloads)).not.toContain('Sick');
    expect(
      push.enqueue.mock.calls.every(
        (c) => ((c as unknown[])[0] as { kind: string }).kind === 'BOOKING_CHANGED_FOR_CLIENT',
      ),
    ).toBe(true);
  });

  it('a coached workout → the client, with the session id', async () => {
    const { service, push } = setup();
    await service.coachedWorkoutLogged(CLIENT, TRAINER, 'ws1');
    expect(push.enqueue).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'COACHED_WORKOUT_LOGGED',
      actorId: TRAINER,
      payload: {
        title: 'Workout logged',
        body: 'Ana logged today’s workout for you',
        data: { workoutSessionId: 'ws1' },
      },
    });
  });

  it('a failed enqueue never fails the notice (and the notice is written first)', async () => {
    const { service, push, notifications } = setup();
    push.enqueue.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(service.requestAnswered(CLIENT, TRAINER, true)).resolves.toBeUndefined();
    expect(notifications.upsertCoaching).toHaveBeenCalled();
    // The rest of the notice work still ran.
    expect(notifications.withdrawCoaching).toHaveBeenCalledWith(
      TRAINER,
      'COACHING_REQUEST',
      CLIENT,
    );
    expect(warn).toHaveBeenCalledWith('[coaching] push enqueue failed:', 'Error');
    warn.mockRestore();
  });

  it('a failed notice write enqueues no push', async () => {
    const { service, push, notifications } = setup();
    notifications.upsertCoaching.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.requestReceived(TRAINER, CLIENT);
    expect(push.enqueue).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
