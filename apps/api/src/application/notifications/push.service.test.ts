import { describe, expect, it, vi } from 'vitest';
import type { EnqueuePushData } from '@chefer/database';
import { PUSH_PREFERENCE_KEYS, PUSH_THROTTLE_MIN, pushDataSchema } from '@chefer/types';
import { pushDedupeKey, PushService, type PushEnqueueInput } from './push.service.js';

// Push enqueue rules (trainer-mode.md §7.2, §14 "push throttling and dedupe"):
// the switch, a device, the throttle (one per recipient + kind + actor per 10
// minutes; reminders exempt), an idempotent row, and ids-only `data`.

const T0 = new Date('2026-10-19T10:00:00Z');
const MIN = 60_000;
const ANA = 'ctrainer00000000000000001';
const MARIA = 'cclient000000000000000001';
const TOM = 'ctom000000000000000000001';

function world(opts: { devices?: string[]; prefs?: Record<string, boolean> } = {}) {
  let now = T0;
  const rows: (EnqueuePushData & { createdAt: Date })[] = [];
  const devices = new Set(opts.devices ?? [MARIA, ANA]);
  const prefs = new Map<string, boolean>(
    Object.entries(opts.prefs ?? {}).map(([k, v]) => [`${MARIA}:${k}`, v]),
  );
  const outbox = {
    enqueue: vi.fn(async (data: EnqueuePushData) => {
      if (rows.some((r) => r.dedupeKey === data.dedupeKey)) return false;
      rows.push({ ...data, createdAt: now });
      return true;
    }),
    recentForThrottle: vi.fn(
      async (userId: string, kind: string, actorId: string | null, since: Date) =>
        rows.filter(
          (r) =>
            r.userId === userId &&
            r.kind === kind &&
            r.actorId === actorId &&
            r.createdAt.getTime() >= since.getTime(),
        ).length,
    ),
  };
  const service = new PushService({
    outbox,
    devices: {
      hasDevice: vi.fn(async (userId: string) => devices.has(userId)),
      register: vi.fn(),
      unregister: vi.fn(async () => true),
      listForExport: vi.fn(async () => []),
    },
    preferences: {
      find: vi.fn(async (userId: string, key: string) => prefs.get(`${userId}:${key}`) ?? null),
      list: vi.fn(async (userId: string) =>
        [...prefs.entries()]
          .filter(([k]) => k.startsWith(`${userId}:`))
          .map(([k, enabled]) => ({ key: k.slice(userId.length + 1), enabled })),
      ),
      set: vi.fn(async (userId: string, key: string, enabled: boolean) => {
        prefs.set(`${userId}:${key}`, enabled);
      }),
    },
    users: {
      findUsers: vi.fn(async () => [
        { id: TOM, firstName: 'Tom', lastName: 'B', name: null, image: null },
      ]),
    },
    now: () => now,
  });
  return {
    service,
    rows,
    outbox,
    devices,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

const routineChanged = (over: Partial<PushEnqueueInput> = {}): PushEnqueueInput => ({
  userId: MARIA,
  kind: 'ROUTINE_CHANGED_BY_TRAINER',
  actorId: ANA,
  payload: { title: 'Routine updated', body: 'Ana updated your routine' },
  ...over,
});

describe('enqueue', () => {
  it('writes one row with the payload and the app tag + kind in data', async () => {
    const w = world();
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('queued');
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({
      userId: MARIA,
      kind: 'ROUTINE_CHANGED_BY_TRAINER',
      actorId: ANA,
      payload: {
        title: 'Routine updated',
        body: 'Ana updated your routine',
        data: { app: 'chefer-push', kind: 'ROUTINE_CHANGED_BY_TRAINER' },
      },
    });
  });

  it('throttles: five saves in a row send one push; the next window sends again', async () => {
    const w = world();
    const outcomes = [];
    for (let i = 0; i < 5; i += 1) {
      outcomes.push(await w.service.enqueue(routineChanged()));
      w.advance(MIN);
    }
    expect(outcomes).toEqual(['queued', 'throttled', 'throttled', 'throttled', 'throttled']);
    w.advance((PUSH_THROTTLE_MIN - 5) * MIN + 1);
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('queued');
    expect(w.rows).toHaveLength(2);
  });

  it('the throttle is per kind and per actor', async () => {
    const w = world();
    await w.service.enqueue(routineChanged());
    await expect(
      w.service.enqueue(routineChanged({ kind: 'COACHED_WORKOUT_LOGGED' })),
    ).resolves.toBe('queued');
    await expect(w.service.enqueue(routineChanged({ actorId: TOM }))).resolves.toBe('queued');
    expect(w.rows).toHaveLength(3);
  });

  it('dedupe: the same event key is written once even when the throttle check races', async () => {
    const w = world();
    w.outbox.recentForThrottle.mockResolvedValue(0); // both writers passed the check
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('queued');
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('duplicate');
    expect(w.rows).toHaveLength(1);
  });

  it('reminders are not throttled by actor: one per booking start and recipient, by key', async () => {
    const w = world();
    const reminder = (bookingId: string, startsAt: number): PushEnqueueInput => ({
      userId: MARIA,
      kind: 'BOOKING_REMINDER_CLIENT',
      actorId: null,
      eventKey: `${bookingId}:${startsAt}`,
      payload: {
        title: 'Booking in 1 hour',
        body: 'Session with Ana in 1 hour',
        data: { bookingId },
      },
    });
    await expect(w.service.enqueue(reminder('b1', 1))).resolves.toBe('queued');
    await expect(w.service.enqueue(reminder('b2', 2))).resolves.toBe('queued');
    // The per-minute sweep meets b1 again: no second reminder.
    w.advance(MIN);
    await expect(w.service.enqueue(reminder('b1', 1))).resolves.toBe('duplicate');
    // b1 moved to another time: a fresh reminder.
    await expect(w.service.enqueue(reminder('b1', 3))).resolves.toBe('queued');
    expect(w.outbox.recentForThrottle).not.toHaveBeenCalled();
    expect(w.rows.map((r) => r.dedupeKey)).toEqual([
      `reminder:${MARIA}:b1:1`,
      `reminder:${MARIA}:b2:2`,
      `reminder:${MARIA}:b1:3`,
    ]);
  });

  it('a switch turned off → nothing is enqueued; other switches still push', async () => {
    const w = world({ prefs: { 'coaching.routine': false } });
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('off');
    await expect(
      w.service.enqueue(routineChanged({ kind: 'COACHED_WORKOUT_LOGGED' })),
    ).resolves.toBe('queued');
    expect(w.rows.map((r) => r.kind)).toEqual(['COACHED_WORKOUT_LOGGED']);
  });

  it('no registered device → nothing is enqueued', async () => {
    const w = world({ devices: [ANA] });
    await expect(w.service.enqueue(routineChanged())).resolves.toBe('no_device');
    expect(w.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('never pushes you about yourself', async () => {
    const w = world();
    await expect(w.service.enqueue(routineChanged({ actorId: MARIA }))).resolves.toBe('off');
    expect(w.rows).toHaveLength(0);
  });

  it('data carries ids only: anything else is stripped, and it parses as PushData', async () => {
    const w = world();
    const sneaky = {
      bookingId: 'b1',
      kcal: 2100,
      weightKg: 81.5,
      note: 'knee pain',
      food: 'oats',
    } as unknown as { bookingId: string };
    await w.service.enqueue(
      routineChanged({
        kind: 'BOOKING_CHANGED_FOR_CLIENT',
        payload: { title: 'New booking', body: 'Ana booked you', data: sneaky },
      }),
    );
    const data = (w.rows[0]?.payload as { data: Record<string, unknown> }).data;
    expect(data).toEqual({
      app: 'chefer-push',
      kind: 'BOOKING_CHANGED_FOR_CLIENT',
      bookingId: 'b1',
    });
    expect(pushDataSchema.strict().safeParse(data).success).toBe(true);
  });

  it('passes the caller transaction to every read and the write', async () => {
    const w = world();
    const tx = { tx: 1 } as never;
    await w.service.enqueue(routineChanged(), tx);
    expect(w.outbox.recentForThrottle).toHaveBeenCalledWith(
      MARIA,
      'ROUTINE_CHANGED_BY_TRAINER',
      ANA,
      expect.any(Date),
      tx,
    );
    expect(w.outbox.enqueue).toHaveBeenCalledWith(expect.anything(), tx);
  });
});

describe('pushDedupeKey', () => {
  it('is deterministic per (kind, recipient, actor, throttle window)', () => {
    const input = routineChanged();
    const a = pushDedupeKey(input, T0);
    expect(pushDedupeKey(input, new Date(T0.getTime() + MIN))).toBe(a);
    expect(pushDedupeKey(input, new Date(T0.getTime() + PUSH_THROTTLE_MIN * MIN))).not.toBe(a);
    expect(a).toBe(
      `ROUTINE_CHANGED_BY_TRAINER:${MARIA}:${ANA}:${Math.floor(T0.getTime() / (PUSH_THROTTLE_MIN * MIN))}`,
    );
  });
});

describe('follow', () => {
  it('names the follower, never their email; request and new follower share the throttle', async () => {
    const w = world();
    await expect(w.service.follow(MARIA, TOM, 'REQUEST')).resolves.toBe('queued');
    await expect(w.service.follow(MARIA, TOM, 'NEW_FOLLOWER')).resolves.toBe('throttled');
    expect(w.rows[0]?.payload).toMatchObject({
      title: 'Follow request',
      body: 'Tom B wants to follow you',
      data: { app: 'chefer-push', kind: 'SOCIAL_FOLLOW' },
    });
  });

  it('respects social.follows', async () => {
    const w = world({ prefs: { 'social.follows': false } });
    await expect(w.service.follow(MARIA, TOM, 'NEW_FOLLOWER')).resolves.toBe('off');
  });
});

describe('preferences', () => {
  it('lists every key with its default, audience and hasDevice; setPreference flips one', async () => {
    const w = world();
    const before = await w.service.preferences(MARIA);
    expect(before.hasDevice).toBe(true);
    expect(before.preferences.map((p) => p.key)).toEqual([...PUSH_PREFERENCE_KEYS]);
    expect(before.preferences.every((p) => p.enabled)).toBe(true);
    expect(before.preferences.find((p) => p.key === 'trainer.requests')?.audience).toBe('trainer');
    const after = await w.service.setPreference(MARIA, 'coaching.bookings', false);
    expect(after.preferences.find((p) => p.key === 'coaching.bookings')?.enabled).toBe(false);
    expect(after.preferences.filter((p) => !p.enabled)).toHaveLength(1);
  });

  it('hasDevice is false without a device', async () => {
    const w = world({ devices: [] });
    expect((await w.service.preferences(MARIA)).hasDevice).toBe(false);
  });
});
