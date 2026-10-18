import { onlineManager } from '@tanstack/react-query';
import type { SyncResultDto, WorkoutSessionDoc } from '@chefer/types';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';
import { createOutbox, type FlushResult, type Outbox } from '../gym/offline/outbox';
import { getConfirmedGymOwner, getGymOwner } from '../gym/offline/owner';
import { startOutboxTriggers } from '../gym/offline/sync-triggers';
import { bookingOfDoc, type CoachedDoc } from './coach-model';

// ─── Coached outbox (trainer-mode.md §6.7 "Saving", §12 "Offline") ────────────
// Finished coached workouts wait here until `trainer.coach.sync` acks them.
// It is the SAME outbox machinery as the trainer's own workouts (durable,
// owner-stamped, backoff, parking, never drops data) — one instance per client,
// in its own KV key, because a coach.sync call carries one client. Never mixed
// with the owner's `gym.session.upsertMany` queue (`gym.outbox`). Flushes on
// enqueue, reconnect, foreground and every 30 s (the owner's triggers, reused).

export type CoachSend = (clientId: string, docs: CoachedDoc[]) => Promise<SyncResultDto[]>;

export interface CoachedOutboxConfig {
  send: CoachSend;
  /** After a client's docs were acked (invalidate their bookings / workouts here). */
  onSynced?: (clientId: string, ids: string[]) => void;
}

export interface CoachedOutboxDeps {
  prefix?: string;
  isOnline?: () => boolean;
  /** Owner allowed to upload now (the server-confirmed trainer); null blocks flushing. */
  getOwnerId?: () => string | null;
  /** Owner stamped on new entries. */
  getStampOwnerId?: () => string | null;
  flushOnEnqueue?: boolean;
  /** Test seam: the flush triggers per client outbox. */
  startTriggers?: (outbox: Outbox) => () => void;
}

export function createCoachedOutboxes(deps: CoachedOutboxDeps = {}) {
  const prefix = deps.prefix ?? KV_KEYS.coachOutbox;
  const startTriggers = deps.startTriggers ?? startOutboxTriggers;
  const boxes = new Map<string, Outbox>();
  const stops = new Map<string, () => void>();
  const listeners = new Set<() => void>();
  let config: CoachedOutboxConfig | null = null;
  let running = false;

  const notify = () => listeners.forEach((listener) => listener());

  const configureBox = (clientId: string, box: Outbox) => {
    const current = config;
    box.configure(
      current
        ? {
            send: (docs: WorkoutSessionDoc[]) =>
              current.send(
                clientId,
                docs.map((doc) => ({ ...doc, bookingId: bookingOfDoc(doc) })),
              ),
            onSynced: (ids) => current.onSynced?.(clientId, ids),
          }
        : null,
    );
  };

  /** The client's outbox, created on first use. */
  const box = (clientId: string): Outbox => {
    const existing = boxes.get(clientId);
    if (existing) return existing;
    const created = createOutbox({
      storageKey: `${prefix}.${clientId}`,
      isOnline: deps.isOnline ?? (() => onlineManager.isOnline()),
      getOwnerId: deps.getOwnerId ?? getConfirmedGymOwner,
      getStampOwnerId: deps.getStampOwnerId ?? getGymOwner,
      ...(deps.flushOnEnqueue !== undefined && { flushOnEnqueue: deps.flushOnEnqueue }),
    });
    boxes.set(clientId, created);
    configureBox(clientId, created);
    created.subscribe(notify);
    if (running) stops.set(clientId, startTriggers(created));
    return created;
  };

  /** Outboxes left on disk by an earlier run (a cold start offline). */
  const discover = () => {
    for (const key of kv.keys()) {
      if (key.startsWith(`${prefix}.`)) box(key.slice(prefix.length + 1));
    }
  };

  const entries = () => [...boxes.entries()];

  return {
    configure(next: CoachedOutboxConfig | null) {
      config = next;
      for (const [clientId, b] of entries()) configureBox(clientId, b);
    },

    /** Queue a finished coached doc for `clientId` (durable before this returns). */
    enqueue(clientId: string, doc: CoachedDoc, options: { ownerId?: string | null } = {}) {
      box(clientId).enqueue(doc, options);
    },

    /** Flush every client's queue (one coach.sync call per client and batch). */
    async flushAll(options: { force?: boolean } = {}): Promise<FlushResult[]> {
      discover();
      return Promise.all(entries().map(([, b]) => b.flush(options)));
    },

    /** Starts the triggers for every client outbox (now and later ones). Returns stop. */
    start(): () => void {
      running = true;
      discover();
      for (const [clientId, b] of entries()) {
        if (!stops.has(clientId)) stops.set(clientId, startTriggers(b));
      }
      return () => {
        running = false;
        stops.forEach((stop) => stop());
        stops.clear();
      };
    },

    /** Queued docs (not parked) for `owner`, across clients. */
    pendingCount(owner: string | null = getGymOwner()): number {
      discover();
      let n = 0;
      for (const [, b] of entries()) {
        n += b
          .getState()
          .entries.filter(
            (e) => !e.parkedReason && (e.ownerId === null || owner === null || e.ownerId === owner),
          ).length;
      }
      return n;
    },

    /** Every queued entry (all owners), parked included — counts for the sign-out warning. */
    totalCount(): number {
      discover();
      return entries().reduce((n, [, b]) => n + b.getState().entries.length, 0);
    },

    /** Is a doc for this booking + client already queued? (A finished workout is not restarted.) */
    hasQueued(clientId: string, bookingId: string | null): boolean {
      discover();
      const b = boxes.get(clientId);
      if (!b) return false;
      return b
        .getState()
        .entries.some((e) => bookingOfDoc(e.doc) === bookingId && e.doc.status === 'COMPLETED');
    },

    /** The per-client outbox (tests, a "needs attention" UI later). */
    forClient: box,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Re-read every queue from disk (after sign-out wiped the keys). */
    reload() {
      for (const [, b] of entries()) b.reload();
      notify();
    },
  };
}

export type CoachedOutboxes = ReturnType<typeof createCoachedOutboxes>;

/** The app-wide coached outboxes. */
export const coachedOutboxes = createCoachedOutboxes();
