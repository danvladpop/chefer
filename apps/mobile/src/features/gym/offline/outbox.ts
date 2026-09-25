import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { workoutSessionDocSchema, type SyncResultDto, type WorkoutSessionDoc } from '@chefer/types';
import { createExternalStore } from './external-store';
import { KV_KEYS } from './keys';
import { getKvBackend } from './kv';
import { getConfirmedGymOwner, getGymOwner, subscribeGymOwner } from './owner';

// Offline outbox (gym_plan.md §5.2): finished and discarded workouts (plus
// orphaned in-progress ones) wait here until gym.session.upsertMany acks them.
//
// Invariants — user data is never dropped silently:
//  • an entry leaves the queue ONLY on an 'applied' or 'stale' ack, or an
//    explicit user "Discard" of a parked entry;
//  • 'rejected' (or a doc that fails validation) PARKS the entry for the user
//    ("needs attention" in gym settings: Copy / Retry / Discard);
//  • network / server errors keep everything and back off exponentially.
// The queue is persisted synchronously on every mutation.

export type SendDocs = (docs: WorkoutSessionDoc[]) => Promise<SyncResultDto[]>;

export interface OutboxEntry {
  doc: WorkoutSessionDoc;
  /** User id the doc belongs to — only that user's session may upload it. */
  ownerId: string | null;
  enqueuedAt: string;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  /** Set ⇒ "needs attention": never sent automatically until retried. */
  parkedReason?: string;
}

export interface OutboxState {
  v: 1;
  entries: OutboxEntry[];
  lastSyncAt: string | null;
  /** Consecutive failed flushes (drives the backoff). */
  failures: number;
  /** Epoch ms before which scheduled (non-forced) flushes are skipped. */
  nextAttemptAt: number | null;
  lastError: string | null;
}

export type FlushSkipReason = 'no-sender' | 'offline' | 'backoff' | 'no-owner' | 'empty';

export interface FlushResult {
  status: 'skipped' | 'ok' | 'error';
  reason?: FlushSkipReason;
  applied: number;
  stale: number;
  parked: number;
  failed: number;
}

export interface OutboxDeps {
  storageKey?: string;
  now?: () => number;
  isOnline?: () => boolean;
  /** Owner allowed to upload now (the server-confirmed user); null blocks flushing. */
  getOwnerId?: () => string | null;
  /** Owner stamped on new entries when the caller passes none (default: getOwnerId). */
  getStampOwnerId?: () => string | null;
  batchSize?: number;
  /** Kick a flush after every enqueue (default true). */
  flushOnEnqueue?: boolean;
}

export interface OutboxConfig {
  send: SendDocs;
  /** Called after any entry was acked (invalidate gym.bootstrap here). */
  onSynced?: (ids: string[]) => void;
}

export const OUTBOX_BATCH_SIZE = 20;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** 5 s, 10 s, 20 s … capped at 5 min. */
export function backoffDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
}

const EMPTY_STATE: OutboxState = {
  v: 1,
  entries: [],
  lastSyncAt: null,
  failures: 0,
  nextAttemptAt: null,
  lastError: null,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}

/** tRPC BAD_REQUEST — the server's Zod rejected the batch input. */
function isBadRequest(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: string; httpStatus?: number } };
  return data?.code === 'BAD_REQUEST' || data?.httpStatus === 400;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createOutbox(deps: OutboxDeps = {}) {
  const key = deps.storageKey ?? KV_KEYS.outbox;
  const now = deps.now ?? Date.now;
  const isOnline = deps.isOnline ?? (() => true);
  const getOwnerId = deps.getOwnerId ?? (() => null);
  const getStampOwnerId = deps.getStampOwnerId ?? getOwnerId;
  const batchSize = Math.min(deps.batchSize ?? OUTBOX_BATCH_SIZE, OUTBOX_BATCH_SIZE);
  const flushOnEnqueue = deps.flushOnEnqueue ?? true;

  let config: OutboxConfig | null = null;
  let inflight: Promise<FlushResult> | null = null;
  // Object, not a bare boolean: it is flipped by other calls across awaits.
  const pending = { rerun: false };
  const rerunRequested = () => pending.rerun;
  const flushing = createExternalStore(() => false);

  const store = createExternalStore<OutboxState>(() => {
    const storage = getKvBackend();
    const raw = storage.getItemSync(key);
    if (raw === null) return EMPTY_STATE;
    try {
      const parsed = JSON.parse(raw) as Partial<OutboxState>;
      if (parsed.v === 1 && Array.isArray(parsed.entries)) {
        return { ...EMPTY_STATE, ...parsed };
      }
    } catch {
      // fall through
    }
    storage.setItemSync(`${KV_KEYS.outboxQuarantine}.${now()}`, raw);
    return EMPTY_STATE;
  });

  const write = (next: OutboxState) => {
    getKvBackend().setItemSync(key, JSON.stringify(next));
    store.set(next);
  };
  const update = (fn: (state: OutboxState) => OutboxState) => write(fn(store.get()));
  const iso = () => new Date(now()).toISOString();

  const patchEntries = (ids: Set<string>, fn: (entry: OutboxEntry) => OutboxEntry | null) =>
    update((state) => ({
      ...state,
      entries: state.entries.flatMap((entry) => {
        if (!ids.has(entry.doc.id)) return [entry];
        const next = fn(entry);
        return next ? [next] : [];
      }),
    }));

  const sendable = (state: OutboxState, owner: string): OutboxEntry[] =>
    state.entries.filter(
      (entry) => !entry.parkedReason && (entry.ownerId === owner || entry.ownerId === null),
    );

  /** One pass over the current snapshot. Returns false when a batch failed. */
  async function flushOnce(owner: string, result: FlushResult): Promise<boolean> {
    const send = config?.send;
    if (!send) return false;

    // Validate locally first: one malformed doc must never poison a batch.
    for (const entry of sendable(store.get(), owner)) {
      const parsed = workoutSessionDocSchema.safeParse(entry.doc);
      if (!parsed.success) {
        const reason = `invalid: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`;
        patchEntries(new Set([entry.doc.id]), (e) => ({ ...e, parkedReason: reason }));
        result.parked++;
      }
    }

    const batches = chunk(sendable(store.get(), owner), batchSize);
    for (const batch of batches) {
      const ok = await sendBatch(send, batch, owner, result);
      if (!ok) return false;
    }
    return true;
  }

  async function sendBatch(
    send: SendDocs,
    batch: OutboxEntry[],
    owner: string,
    result: FlushResult,
  ): Promise<boolean> {
    const ids = new Set(batch.map((e) => e.doc.id));
    const attemptAt = iso();
    let results: SyncResultDto[];
    try {
      results = await send(batch.map((e) => e.doc));
    } catch (error) {
      if (isBadRequest(error) && batch.length > 1) {
        // The server rejected the batch as a whole — isolate the culprit(s).
        for (const entry of batch) {
          const ok = await sendBatch(send, [entry], owner, result);
          if (!ok) return false;
        }
        return true;
      }
      const message = errorMessage(error);
      if (isBadRequest(error)) {
        patchEntries(ids, (e) => ({
          ...e,
          attempts: e.attempts + 1,
          lastAttemptAt: attemptAt,
          lastError: message,
          parkedReason: `rejected: ${message}`,
        }));
        result.parked += batch.length;
        return true;
      }
      patchEntries(ids, (e) => ({
        ...e,
        attempts: e.attempts + 1,
        lastAttemptAt: attemptAt,
        lastError: message,
      }));
      result.failed += batch.length;
      update((state) => {
        const failures = state.failures + 1;
        return {
          ...state,
          failures,
          nextAttemptAt: now() + backoffDelay(failures),
          lastError: message,
        };
      });
      return false;
    }

    const byId = new Map(results.map((r) => [r.id, r]));
    const acked: string[] = [];
    patchEntries(ids, (entry) => {
      const ack = byId.get(entry.doc.id);
      if (!ack) {
        result.failed++;
        return {
          ...entry,
          attempts: entry.attempts + 1,
          lastAttemptAt: attemptAt,
          lastError: 'No result for this session in the server response',
        };
      }
      if (ack.status === 'applied' || ack.status === 'stale') {
        if (ack.status === 'applied') result.applied++;
        else result.stale++;
        acked.push(entry.doc.id);
        return null;
      }
      result.parked++;
      return {
        ...entry,
        attempts: entry.attempts + 1,
        lastAttemptAt: attemptAt,
        lastError: ack.reason ?? 'Rejected by the server',
        parkedReason: `rejected: ${ack.reason ?? 'rejected by the server'}`,
      };
    });
    update((state) => ({
      ...state,
      failures: 0,
      nextAttemptAt: null,
      lastError: null,
      lastSyncAt: acked.length > 0 ? attemptAt : state.lastSyncAt,
    }));
    if (acked.length > 0) {
      try {
        config?.onSynced?.(acked);
      } catch {
        // A cache-invalidation hiccup must not undo a successful sync.
      }
    }
    return true;
  }

  async function run(force: boolean): Promise<FlushResult> {
    const result: FlushResult = { status: 'ok', applied: 0, stale: 0, parked: 0, failed: 0 };
    const skip = (reason: FlushSkipReason): FlushResult => ({
      ...result,
      status: 'skipped',
      reason,
    });

    if (!config) return skip('no-sender');
    const owner = getOwnerId();
    if (owner === null) return skip('no-owner');
    if (!isOnline()) return skip('offline');
    const { nextAttemptAt } = store.get();
    if (!force && nextAttemptAt !== null && now() < nextAttemptAt) return skip('backoff');
    if (sendable(store.get(), owner).length === 0) return skip('empty');

    flushing.set(true);
    try {
      // Entries enqueued mid-flight are picked up by another pass (bounded).
      for (let pass = 0; pass < 5; pass++) {
        pending.rerun = false;
        const ok = await flushOnce(owner, result);
        if (!ok) {
          result.status = 'error';
          break;
        }
        if (!rerunRequested()) break;
      }
    } finally {
      flushing.set(false);
    }
    return result;
  }

  const outbox = {
    configure(next: OutboxConfig | null) {
      config = next;
    },

    /** Queue a doc (replaces a queued copy of the same session if not older). */
    enqueue(doc: WorkoutSessionDoc, options: { ownerId?: string | null } = {}) {
      const ownerId = options.ownerId !== undefined ? options.ownerId : getStampOwnerId();
      update((state) => {
        const existing = state.entries.find((e) => e.doc.id === doc.id);
        if (!existing) {
          const entry: OutboxEntry = {
            doc,
            ownerId,
            enqueuedAt: iso(),
            attempts: 0,
            lastError: null,
            lastAttemptAt: null,
          };
          return { ...state, entries: [...state.entries, entry] };
        }
        if (existing.doc.clientUpdatedAt > doc.clientUpdatedAt) {
          return state; // an older copy never overwrites a newer one
        }
        return {
          ...state,
          entries: state.entries.map((e) => {
            if (e.doc.id !== doc.id) return e;
            // A fresh copy gets a fresh chance: drop the parked flag.
            const { parkedReason: _dropped, ...rest } = e;
            return { ...rest, doc, ownerId: ownerId ?? e.ownerId };
          }),
        };
      });
      if (inflight) pending.rerun = true;
      if (flushOnEnqueue) {
        void outbox.flush({ force: true });
      }
    },

    /**
     * Send everything sendable. Single-flight: concurrent callers share the
     * running pass. `force` ignores the backoff window (reconnect, foreground,
     * enqueue, manual retry); the 30 s ticker does not force.
     */
    flush(options: { force?: boolean } = {}): Promise<FlushResult> {
      if (inflight) {
        pending.rerun = true;
        return inflight;
      }
      inflight = run(options.force ?? false).finally(() => {
        inflight = null;
      });
      return inflight;
    },

    /** User "Retry" on a parked entry. */
    retryParked(id: string): Promise<FlushResult> {
      patchEntries(new Set([id]), (e) => {
        const { parkedReason: _dropped, ...rest } = e;
        return rest;
      });
      return outbox.flush({ force: true });
    },

    /** User "Discard" on a parked entry — the ONLY way data leaves unacked. */
    discardParked(id: string): OutboxEntry | null {
      const entry = store.get().entries.find((e) => e.doc.id === id && e.parkedReason);
      if (!entry) return null;
      patchEntries(new Set([id]), () => null);
      return entry;
    },

    getState: store.get,
    subscribe: store.subscribe,
    isFlushing: flushing.get,
    subscribeFlushing: flushing.subscribe,
    /** Re-read from disk (tests; after an account switch). */
    reload: store.reset,
  };

  return outbox;
}

export type Outbox = ReturnType<typeof createOutbox>;

export interface OutboxStatus {
  /** Entries waiting to upload for the current user (not parked). */
  pending: number;
  /** "Needs attention" entries (rejected / invalid). */
  parked: OutboxEntry[];
  /** Queued entries that belong to a different account on this phone. */
  otherAccount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  isFlushing: boolean;
}

export function selectOutboxStatus(
  state: OutboxState,
  owner: string | null,
  isFlushing: boolean,
): OutboxStatus {
  const mine = (e: OutboxEntry) => e.ownerId === null || owner === null || e.ownerId === owner;
  return {
    pending: state.entries.filter((e) => mine(e) && !e.parkedReason).length,
    parked: state.entries.filter((e) => mine(e) && e.parkedReason),
    otherAccount: state.entries.filter((e) => !mine(e)).length,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    isFlushing,
  };
}

export function useOutboxStatusFor(outbox: Outbox, owner: string | null): OutboxStatus {
  const state = useSyncExternalStore(outbox.subscribe, outbox.getState);
  const isFlushing = useSyncExternalStore(outbox.subscribeFlushing, outbox.isFlushing);
  return selectOutboxStatus(state, owner, isFlushing);
}

/** The app-wide outbox (online state from TanStack's NetInfo-fed onlineManager). */
export const outbox = createOutbox({
  isOnline: () => onlineManager.isOnline(),
  getOwnerId: getConfirmedGymOwner,
  getStampOwnerId: getGymOwner,
});

/** Pending count, parked items and last sync for the signed-in user. */
export function useOutboxStatus(): OutboxStatus {
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner);
  return useOutboxStatusFor(outbox, owner);
}
