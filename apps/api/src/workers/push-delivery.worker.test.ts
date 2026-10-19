import { describe, expect, it, vi } from 'vitest';
import type { PushDeviceTarget, PushOutbox } from '@chefer/database';
import { PUSH_RETENTION, PUSH_SEND_BATCH } from '@chefer/types';
import {
  ExpoPushError,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
  type IExpoPushClient,
} from '../infrastructure/push/expo-push.client.js';
import {
  MAX_DEVICES_PER_USER,
  packRows,
  PushDeliveryWorker,
  RECEIPT_DELAY_MIN,
  STALE_AFTER_MIN,
} from './push-delivery.worker.js';

// The push-delivery worker (trainer-mode.md §7.2 "Infrastructure", §10):
// outbox → Expo in batches of ≤ 100, DeviceNotRegistered pruning from tickets
// and receipts, retries with attempts, reminders once a minute, retention.

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../infrastructure/push/expo-push.client.js', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, expoPushClient: {} };
});
vi.mock('../application/notifications/push-reminders.service.js', () => ({
  pushRemindersService: { enqueueDue: vi.fn() },
}));
vi.mock('../lib/env.js', () => ({ env: { EXPO_PUSH_ENABLED: false } }));

const NOW = new Date('2026-10-19T10:00:00Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function row(id: string, userId: string, over: Partial<PushOutbox> = {}): PushOutbox {
  return {
    id,
    userId,
    kind: 'BOOKING_CHANGED_FOR_CLIENT',
    actorId: 'ctrainer',
    payload: {
      title: 'New booking',
      body: 'Ana booked you for Wed 21 Oct, 18:00',
      data: { app: 'chefer-push', kind: 'BOOKING_CHANGED_FOR_CLIENT', bookingId: 'b1' },
    },
    dedupeKey: `k-${id}`,
    createdAt: NOW,
    sentAt: null,
    attempts: 0,
    lastError: null,
    ticketIds: [],
    receiptsCheckedAt: null,
    ...over,
  };
}

const token = (deviceId: string) => `ExponentPushToken[${deviceId}]`;

function setup(opts: {
  due?: PushOutbox[];
  devices?: Record<string, string[]>;
  awaiting?: PushOutbox[];
  send?: (messages: readonly ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;
  receipts?: (ids: readonly string[]) => Promise<Record<string, ExpoPushReceipt>>;
}) {
  let due = [...(opts.due ?? [])];
  const sentBatches: ExpoPushMessage[][] = [];
  const client: IExpoPushClient = {
    send: vi.fn(async (messages: readonly ExpoPushMessage[]) => {
      sentBatches.push([...messages]);
      return opts.send
        ? opts.send(messages)
        : messages.map((m) => ({ status: 'ok' as const, id: `t-${m.to}` }));
    }),
    getReceipts: vi.fn(async (ids: readonly string[]) => (opts.receipts ? opts.receipts(ids) : {})),
  };
  const outbox = {
    claimDue: vi.fn(async (limit: number) => {
      const out = due.slice(0, limit);
      due = due.slice(limit);
      return out;
    }),
    markSent: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    rowsAwaitingReceipts: vi.fn(async () => opts.awaiting ?? []),
    markReceiptsChecked: vi.fn(async () => undefined),
    deleteSentBefore: vi.fn(async () => 3),
    deleteUnsentBefore: vi.fn(async () => 1),
  };
  const devices = {
    listTargetsForUsers: vi.fn(async (userIds: readonly string[]) => {
      const map = new Map<string, PushDeviceTarget[]>();
      for (const u of userIds) {
        const ids = opts.devices?.[u] ?? [];
        map.set(
          u,
          ids.map((id) => ({ id, expoPushToken: token(id) })),
        );
      }
      return map;
    }),
    deleteByIds: vi.fn(async (ids: readonly string[]) => ids.length),
    pruneUnseenBefore: vi.fn(async () => 2),
  };
  const reminders = { enqueueDue: vi.fn(async () => ({ queued: 0 })) };
  let now = NOW;
  const worker = new PushDeliveryWorker({
    outbox,
    devices,
    client,
    reminders,
    now: () => now,
  });
  return {
    worker,
    client,
    outbox,
    devices,
    reminders,
    sentBatches,
    setNow: (d: Date) => {
      now = d;
    },
  };
}

describe('send', () => {
  it('one message per device, Expo-shaped, ids-only data; tickets stored with the device id', async () => {
    const w = setup({ due: [row('r1', 'u1')], devices: { u1: ['d1', 'd2'] } });
    await expect(w.worker.sendDue(NOW)).resolves.toMatchObject({ sent: 1, messages: 2 });
    expect(w.sentBatches).toEqual([
      [
        {
          to: token('d1'),
          title: 'New booking',
          body: 'Ana booked you for Wed 21 Oct, 18:00',
          data: { app: 'chefer-push', kind: 'BOOKING_CHANGED_FOR_CLIENT', bookingId: 'b1' },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        },
        expect.objectContaining({ to: token('d2') }),
      ],
    ]);
    expect(w.outbox.markSent).toHaveBeenCalledWith(
      'r1',
      [`t-${token('d1')}@d1`, `t-${token('d2')}@d2`],
      NOW,
    );
    expect(w.outbox.claimDue).toHaveBeenCalledWith(
      PUSH_SEND_BATCH,
      new Date(NOW.getTime() - STALE_AFTER_MIN * MIN),
      PUSH_RETENTION.maxAttempts,
    );
  });

  it('batches: never more than 100 messages per request, and a row is never split', async () => {
    // 100 rows × 3 devices = 300 messages, then 30 more rows in a second claim.
    const due = Array.from({ length: 130 }, (_, i) => row(`r${i}`, `u${i}`));
    const devices = Object.fromEntries(
      due.map((r) => [r.userId, ['a', 'b', 'c'].map((d) => `${r.userId}-${d}`)]),
    );
    const w = setup({ due, devices });
    const result = await w.worker.sendDue(NOW);
    expect(result).toMatchObject({ sent: 130, failed: 0, messages: 390 });
    expect(w.sentBatches.every((b) => b.length <= PUSH_SEND_BATCH)).toBe(true);
    // 33 rows (99 messages) per request: rows stay whole.
    expect(w.sentBatches.map((b) => b.length)).toEqual([99, 99, 99, 3, 90]);
    expect(w.outbox.claimDue).toHaveBeenCalledTimes(2);
  });

  it('caps devices per user and sends nothing for a user without devices (marked sent)', async () => {
    const w = setup({ due: [row('r1', 'u1')], devices: {} });
    await w.worker.sendDue(NOW);
    expect(w.client.send).not.toHaveBeenCalled();
    expect(w.outbox.markSent).toHaveBeenCalledWith('r1', [], NOW);
    expect(w.devices.listTargetsForUsers).toHaveBeenCalledWith(['u1'], MAX_DEVICES_PER_USER);
  });

  it('a DeviceNotRegistered ticket deletes that device; the row is still sent', async () => {
    const w = setup({
      due: [row('r1', 'u1')],
      devices: { u1: ['dead', 'live'] },
      send: async (messages) =>
        messages.map((m) =>
          m.to === token('dead')
            ? {
                status: 'error' as const,
                message: `${m.to} is not a registered push notification recipient`,
                details: { error: 'DeviceNotRegistered' },
              }
            : { status: 'ok' as const, id: 'tlive' },
        ),
    });
    await expect(w.worker.sendDue(NOW)).resolves.toMatchObject({ sent: 1, devicesPruned: 1 });
    expect(w.devices.deleteByIds).toHaveBeenCalledWith(['dead']);
    expect(w.outbox.markSent).toHaveBeenCalledWith('r1', ['tlive@live'], NOW);
  });

  it('every ticket failed otherwise → attempts + 1 with the error code (never the token), retried next tick', async () => {
    const w = setup({
      due: [row('r1', 'u1'), row('r2', 'u2')],
      devices: { u1: ['d1'], u2: ['d2'] },
      send: async (messages) =>
        messages.map((m) =>
          m.to === token('d1')
            ? {
                status: 'error' as const,
                message: `rate exceeded for ${m.to}`,
                details: { error: 'MessageRateExceeded' },
              }
            : { status: 'ok' as const, id: 't2' },
        ),
    });
    await expect(w.worker.sendDue(NOW)).resolves.toMatchObject({ sent: 1, failed: 1 });
    expect(w.outbox.markFailed).toHaveBeenCalledWith('r1', 'MessageRateExceeded');
    expect(JSON.stringify(w.outbox.markFailed.mock.calls)).not.toContain('PushToken');
    expect(w.outbox.markSent).toHaveBeenCalledWith('r2', ['t2@d2'], NOW);
  });

  it('a failed request marks its rows failed and stops sending for this tick', async () => {
    const due = Array.from({ length: 150 }, (_, i) => row(`r${i}`, `u${i}`));
    const w = setup({
      due,
      devices: Object.fromEntries(due.map((r) => [r.userId, [`${r.userId}-d`]])),
      send: async () => {
        throw new ExpoPushError('HTTP_503');
      },
    });
    const result = await w.worker.sendDue(NOW);
    expect(w.client.send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sent: 0, failed: 100 });
    expect(w.outbox.markFailed).toHaveBeenCalledWith('r0', 'HTTP_503');
    expect(w.outbox.claimDue).toHaveBeenCalledTimes(1);
  });

  it('an unreadable payload is a failed attempt, not a send', async () => {
    const w = setup({
      due: [row('r1', 'u1', { payload: { title: 'x', body: 'y', data: { kcal: 1 } } })],
      devices: { u1: ['d1'] },
    });
    await w.worker.sendDue(NOW);
    expect(w.client.send).not.toHaveBeenCalled();
    expect(w.outbox.markFailed).toHaveBeenCalledWith('r1', 'INVALID_PAYLOAD');
  });

  it('the no-op client (EXPO_PUSH_ENABLED unset): rows are marked sent with no tickets', async () => {
    const { NoopExpoPushClient } = await import('../infrastructure/push/expo-push.client.js');
    const w = setup({ due: [row('r1', 'u1')], devices: { u1: ['d1'] } });
    const worker = new PushDeliveryWorker({
      outbox: w.outbox,
      devices: w.devices,
      client: new NoopExpoPushClient(),
      reminders: w.reminders,
      now: () => NOW,
    });
    await worker.sendDue(NOW);
    expect(w.outbox.markSent).toHaveBeenCalledWith('r1', [], NOW);
  });
});

describe('receipts', () => {
  it('checks rows sent 15+ minutes ago; DeviceNotRegistered deletes the device', async () => {
    const sent = (id: string, tickets: string[]) =>
      row(id, 'u1', { sentAt: new Date(NOW.getTime() - 20 * MIN), ticketIds: tickets });
    const w = setup({
      awaiting: [sent('r1', ['t1@d1', 't2@d2']), sent('r2', ['t3@d3'])],
      receipts: async () => ({
        t1: { status: 'ok' },
        t2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        t3: { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      }),
    });
    await expect(w.worker.checkReceipts(NOW)).resolves.toEqual({ checked: 2, devicesPruned: 1 });
    expect(w.outbox.rowsAwaitingReceipts).toHaveBeenCalledWith(
      new Date(NOW.getTime() - RECEIPT_DELAY_MIN * MIN),
      expect.any(Number),
    );
    expect(w.client.getReceipts).toHaveBeenCalledWith(['t1', 't2', 't3']);
    expect(w.devices.deleteByIds).toHaveBeenCalledWith(['d2']);
    expect(w.outbox.markReceiptsChecked).toHaveBeenCalledWith(['r1', 'r2'], NOW);
  });

  it('a failed lookup leaves the rows unchecked for the next tick', async () => {
    const w = setup({
      awaiting: [row('r1', 'u1', { sentAt: NOW, ticketIds: ['t1@d1'] })],
      receipts: async () => {
        throw new ExpoPushError('HTTP_500');
      },
    });
    await expect(w.worker.checkReceipts(NOW)).rejects.toThrow(ExpoPushError);
    expect(w.outbox.markReceiptsChecked).not.toHaveBeenCalled();
  });

  it('packs ≤ 1000 ids per lookup', () => {
    const rows = Array.from({ length: 300 }, () => ({ messages: [1, 2, 3, 4] }));
    expect(packRows(rows, 1000).map((c) => c.flatMap((r) => r.messages).length)).toEqual([
      1000, 200,
    ]);
  });
});

describe('tick', () => {
  it('reminders run once a minute; retention once a UTC day (§10)', async () => {
    const w = setup({});
    await w.worker.tick();
    w.setNow(new Date(NOW.getTime() + 20_000));
    await w.worker.tick();
    expect(w.reminders.enqueueDue).toHaveBeenCalledTimes(1);
    w.setNow(new Date(NOW.getTime() + MIN));
    await w.worker.tick();
    expect(w.reminders.enqueueDue).toHaveBeenCalledTimes(2);

    expect(w.devices.pruneUnseenBefore).toHaveBeenCalledTimes(1);
    expect(w.devices.pruneUnseenBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - PUSH_RETENTION.deviceUnseenDays * DAY),
    );
    expect(w.outbox.deleteSentBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - PUSH_RETENTION.sentOutboxDays * DAY),
    );
    expect(w.outbox.deleteUnsentBefore).toHaveBeenCalledTimes(1);
    w.setNow(new Date(NOW.getTime() + DAY));
    await w.worker.tick();
    expect(w.devices.pruneUnseenBefore).toHaveBeenCalledTimes(2);
  });

  it('a failing step never stops the others', async () => {
    const w = setup({ due: [row('r1', 'u1')], devices: { u1: ['d1'] } });
    w.reminders.enqueueDue.mockRejectedValueOnce(new Error('db down'));
    await w.worker.tick();
    expect(w.client.send).toHaveBeenCalledTimes(1);
    expect(w.devices.pruneUnseenBefore).toHaveBeenCalled();
  });
});
