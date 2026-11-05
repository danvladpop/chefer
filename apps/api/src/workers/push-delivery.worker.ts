import { z } from 'zod';
import {
  pushDeviceRepository,
  pushOutboxRepository,
  type IPushDeviceRepository,
  type IPushOutboxRepository,
  type PushDeviceTarget,
  type PushOutbox,
} from '@chefer/database';
import { PUSH_RECEIPT_BATCH, PUSH_RETENTION, PUSH_SEND_BATCH, pushDataSchema } from '@chefer/types';
import { pushRemindersService } from '../application/notifications/push-reminders.service.js';
import {
  expoPushClient,
  ExpoPushError,
  type ExpoPushMessage,
  type IExpoPushClient,
} from '../infrastructure/push/expo-push.client.js';
import { logger } from '../lib/logger.js';

// ─── Push delivery (docs/prd-2026-10/trainer-mode.md §7.2 "Infrastructure", §10; M4) ──
// Drains PushOutbox through the Expo push API. Every TICK_MS:
//   1. reminders (once per minute): PushRemindersService enqueues the booking
//      reminders due in about an hour;
//   2. send: unsent rows (attempts < maxAttempts, created in the last
//      STALE_AFTER_MIN minutes — a stale "in 1 hour" is worse than none) are
//      claimed PUSH_SEND_BATCH at a time; each row becomes one message per
//      device of its recipient (at most MAX_DEVICES_PER_USER, most recently
//      seen first); messages go in requests of ≤ PUSH_SEND_BATCH, a row never
//      split across two. A DeviceNotRegistered ticket deletes that device at
//      once; a row whose every ticket failed otherwise (or whose request
//      failed) gets attempts + 1 and the error code, and is retried next tick.
//      A failed request stops this tick's sending (Expo is down: back off);
//   3. receipts: rows sent RECEIPT_DELAY_MIN+ minutes ago are checked
//      (≤ PUSH_RECEIPT_BATCH ids per lookup); a DeviceNotRegistered receipt
//      deletes the device. Each ticket is stored as `${ticketId}@${deviceId}`
//      so the receipt finds its device without keeping a token in the outbox;
//   4. housekeeping (once per UTC day, §10): devices unseen for 90 days, rows
//      sent more than 7 days ago, and unsent rows (given up, or stale) older
//      than 7 days are deleted.
// It always runs: without EXPO_PUSH_ENABLED=true the client is the no-op one,
// rows are marked sent with no tickets and nothing leaves the server.
// Never a token, a title or a body in a log line or a stored error: counts and
// Expo's error codes only.

const TICK_MS = 20_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A row not sent within this long is left for housekeeping. */
export const STALE_AFTER_MIN = 60;
/** Expo's receipts are ready within ~15 minutes of sending. */
export const RECEIPT_DELAY_MIN = 15;
export const MAX_DEVICES_PER_USER = 10;
/** Send batches per tick (each ≤ PUSH_SEND_BATCH rows). */
const MAX_SEND_ROUNDS = 5;
const RECEIPT_ROWS_PER_TICK = 500;
const TICKET_SEPARATOR = '@';

const payloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  data: pushDataSchema,
});

export interface PushDeliveryDeps {
  outbox: Pick<
    IPushOutboxRepository,
    | 'claimDue'
    | 'markSent'
    | 'markFailed'
    | 'rowsAwaitingReceipts'
    | 'markReceiptsChecked'
    | 'deleteSentBefore'
    | 'deleteUnsentBefore'
  >;
  devices: Pick<IPushDeviceRepository, 'listTargetsForUsers' | 'deleteByIds' | 'pruneUnseenBefore'>;
  client: IExpoPushClient;
  reminders: { enqueueDue(now: Date): Promise<{ queued: number }> };
  now: () => Date;
}

const defaultDeps: PushDeliveryDeps = {
  outbox: pushOutboxRepository,
  devices: pushDeviceRepository,
  client: expoPushClient,
  reminders: pushRemindersService,
  now: () => new Date(),
};

export interface SendResult {
  sent: number;
  failed: number;
  messages: number;
  devicesPruned: number;
}

interface RowMessages {
  row: PushOutbox;
  targets: PushDeviceTarget[];
  messages: ExpoPushMessage[];
}

function errorCode(ticket: { details?: { error?: string | undefined } | undefined }): string {
  return ticket.details?.error ?? 'UNKNOWN';
}

/** Packs rows into requests of ≤ `max` messages; a row is never split. */
export function packRows<T extends { messages: unknown[] }>(
  rows: readonly T[],
  max: number,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const row of rows) {
    if (size + row.messages.length > max && current.length > 0) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += row.messages.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export class PushDeliveryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastReminderMinute = -1;
  private lastHousekeepingDay: string | null = null;
  private readonly deps: PushDeliveryDeps;

  constructor(deps: Partial<PushDeliveryDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  start(): void {
    if (this.timer) return;
    logger.info({ tickMs: TICK_MS }, '[PushDeliveryWorker] started');
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[PushDeliveryWorker] stopped');
  }

  /** One pass (exposed for tests). Overlapping ticks are skipped. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.deps.now();
      await this.step('reminders', () => this.reminders(now));
      await this.step('send', () => this.sendDue(now));
      await this.step('receipts', () => this.checkReceipts(now));
      await this.step('housekeeping', () => this.housekeeping(now));
    } finally {
      this.running = false;
    }
  }

  private async step(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      logger.error(
        {
          step: name,
          code:
            err instanceof ExpoPushError ? err.code : err instanceof Error ? err.name : 'unknown',
        },
        '[PushDeliveryWorker] step failed',
      );
    }
  }

  async reminders(now: Date): Promise<number> {
    const minute = Math.floor(now.getTime() / MINUTE_MS);
    if (minute === this.lastReminderMinute) return 0;
    this.lastReminderMinute = minute;
    const { queued } = await this.deps.reminders.enqueueDue(now);
    if (queued > 0) logger.info({ queued }, '[PushDeliveryWorker] booking reminders queued');
    return queued;
  }

  async sendDue(now: Date): Promise<SendResult> {
    const total: SendResult = { sent: 0, failed: 0, messages: 0, devicesPruned: 0 };
    const notBefore = new Date(now.getTime() - STALE_AFTER_MIN * MINUTE_MS);
    for (let round = 0; round < MAX_SEND_ROUNDS; round += 1) {
      const rows = await this.deps.outbox.claimDue(
        PUSH_SEND_BATCH,
        notBefore,
        PUSH_RETENTION.maxAttempts,
      );
      if (rows.length === 0) break;
      const { result, aborted } = await this.sendRows(rows, now);
      total.sent += result.sent;
      total.failed += result.failed;
      total.messages += result.messages;
      total.devicesPruned += result.devicesPruned;
      // A failed row stays due: retry it next tick, not in this one.
      if (aborted || result.failed > 0 || rows.length < PUSH_SEND_BATCH) break;
    }
    if (total.sent + total.failed > 0) logger.info(total, '[PushDeliveryWorker] sent');
    return total;
  }

  private async sendRows(
    rows: readonly PushOutbox[],
    now: Date,
  ): Promise<{ result: SendResult; aborted: boolean }> {
    const result: SendResult = { sent: 0, failed: 0, messages: 0, devicesPruned: 0 };
    const targetsByUser = await this.deps.devices.listTargetsForUsers(
      rows.map((r) => r.userId),
      MAX_DEVICES_PER_USER,
    );
    const ready: RowMessages[] = [];
    for (const row of rows) {
      const payload = payloadSchema.safeParse(row.payload);
      if (!payload.success) {
        await this.deps.outbox.markFailed(row.id, 'INVALID_PAYLOAD');
        result.failed += 1;
        continue;
      }
      const targets = targetsByUser.get(row.userId) ?? [];
      if (targets.length === 0) {
        // Signed out (or pruned) since it was enqueued: nothing to send.
        await this.deps.outbox.markSent(row.id, [], now);
        result.sent += 1;
        continue;
      }
      ready.push({
        row,
        targets,
        messages: targets.map((t) => ({
          to: t.expoPushToken,
          title: payload.data.title,
          body: payload.data.body,
          data: payload.data.data,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        })),
      });
    }

    const dead: string[] = [];
    let aborted = false;
    for (const chunk of packRows(ready, PUSH_SEND_BATCH)) {
      const messages = chunk.flatMap((r) => r.messages);
      let tickets;
      try {
        tickets = await this.deps.client.send(messages);
      } catch (err) {
        const code = err instanceof ExpoPushError ? err.code : 'SEND_FAILED';
        for (const r of chunk) await this.deps.outbox.markFailed(r.row.id, code);
        result.failed += chunk.length;
        aborted = true;
        break;
      }
      result.messages += messages.length;
      let offset = 0;
      for (const r of chunk) {
        const own = tickets.slice(offset, offset + r.messages.length);
        offset += r.messages.length;
        const ticketIds: string[] = [];
        let ok = 0;
        let otherError: string | null = null;
        for (const [i, ticket] of own.entries()) {
          const target = r.targets[i];
          if (!target) continue;
          if (ticket.status === 'ok') {
            ok += 1;
            if (ticket.id) ticketIds.push(`${ticket.id}${TICKET_SEPARATOR}${target.id}`);
          } else if (errorCode(ticket) === 'DeviceNotRegistered') {
            dead.push(target.id);
          } else {
            otherError ??= errorCode(ticket);
          }
        }
        if (ok === 0 && otherError !== null) {
          await this.deps.outbox.markFailed(r.row.id, otherError);
          result.failed += 1;
        } else {
          await this.deps.outbox.markSent(r.row.id, ticketIds, now);
          result.sent += 1;
        }
      }
    }
    result.devicesPruned = await this.deps.devices.deleteByIds([...new Set(dead)]);
    return { result, aborted };
  }

  async checkReceipts(now: Date): Promise<{ checked: number; devicesPruned: number }> {
    const before = new Date(now.getTime() - RECEIPT_DELAY_MIN * MINUTE_MS);
    const rows = await this.deps.outbox.rowsAwaitingReceipts(before, RECEIPT_ROWS_PER_TICK);
    if (rows.length === 0) return { checked: 0, devicesPruned: 0 };
    const withTickets = rows.map((row) => ({
      row,
      messages: row.ticketIds.flatMap((entry) => {
        const [ticketId, deviceId] = entry.split(TICKET_SEPARATOR);
        return ticketId && deviceId ? [{ ticketId, deviceId }] : [];
      }),
    }));
    const dead: string[] = [];
    let checked = 0;
    for (const chunk of packRows(withTickets, PUSH_RECEIPT_BATCH)) {
      const pairs = chunk.flatMap((r) => r.messages);
      // A failed lookup leaves the rows unchecked: the next tick retries them.
      const receipts = await this.deps.client.getReceipts(pairs.map((p) => p.ticketId));
      for (const { ticketId, deviceId } of pairs) {
        const receipt = receipts[ticketId];
        if (receipt?.status === 'error' && errorCode(receipt) === 'DeviceNotRegistered') {
          dead.push(deviceId);
        }
      }
      await this.deps.outbox.markReceiptsChecked(
        chunk.map((r) => r.row.id),
        now,
      );
      checked += chunk.length;
    }
    const devicesPruned = await this.deps.devices.deleteByIds([...new Set(dead)]);
    if (devicesPruned > 0) {
      logger.info({ devicesPruned }, '[PushDeliveryWorker] unregistered devices pruned');
    }
    return { checked, devicesPruned };
  }

  /** §10 retention, once per UTC day. Null when it already ran today. */
  async housekeeping(now: Date): Promise<{ devices: number; sent: number; unsent: number } | null> {
    const day = now.toISOString().slice(0, 10);
    if (day === this.lastHousekeepingDay) return null;
    const devices = await this.deps.devices.pruneUnseenBefore(
      new Date(now.getTime() - PUSH_RETENTION.deviceUnseenDays * DAY_MS),
    );
    const outboxCutoff = new Date(now.getTime() - PUSH_RETENTION.sentOutboxDays * DAY_MS);
    const sent = await this.deps.outbox.deleteSentBefore(outboxCutoff);
    const unsent = await this.deps.outbox.deleteUnsentBefore(outboxCutoff);
    this.lastHousekeepingDay = day;
    if (devices + sent + unsent > 0) {
      logger.info({ devices, sent, unsent }, '[PushDeliveryWorker] retention pruned');
    }
    return { devices, sent, unsent };
  }
}

export const pushDeliveryWorker = new PushDeliveryWorker();
