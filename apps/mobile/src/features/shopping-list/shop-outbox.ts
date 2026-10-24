import { isNetworkError, isServerError } from '@chefer/utils';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';

// ─── Shopping-list outbox (ADR 0003 "Offline check-offs reconcile by last write per item") ───
// Every tick on Shop is enqueued here first (the UI flips at once, as before) and sent from here, in
// order, with the device time it was made (`at`). An entry leaves the outbox only when the server
// accepted it, or answered with a 4xx that no retry can fix (the plan is gone). A network error or a
// 5xx keeps it for the next flush — on reconnect, at launch, on the next tick — so ticks made in a
// supermarket basement survive the app being killed. The server keeps the newest change per item by
// `at`, so a late replay never undoes a newer tick from the other phone.
//
// Persisted in the same KV store as the gym outbox, under `KV_KEYS.shopOutbox`. Pure of React: the
// hooks in use-shop-toggle.ts read it through `subscribe` / `entries`.

export type ShopOutboxEntry = {
  planId: string;
  keys: string[];
  checked: boolean;
  /** ISO device time of the tick. */
  at: string;
};

/** Sends one entry (`shoppingList.toggleItems`); throws what the client threw. */
export type ShopOutboxSend = (entry: ShopOutboxEntry) => Promise<unknown>;

export type ShopFlushResult = { sent: number; dropped: ShopOutboxEntry[]; blocked: boolean };

/** What to do with an entry whose send failed. */
export function shopSendFailure(error: unknown): 'retry' | 'drop' {
  if (isNetworkError(error) || isServerError(error)) return 'retry';
  const status = (error as { data?: { httpStatus?: unknown } } | null)?.data?.httpStatus;
  // Rate limited or timed out: try again later. Any other 4xx (the plan is gone, bad input): drop.
  if (status === 429 || status === 408) return 'retry';
  return typeof status === 'number' && status >= 400 && status < 500 ? 'drop' : 'retry';
}

function isEntry(value: unknown): value is ShopOutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.planId === 'string' &&
    Array.isArray(v.keys) &&
    v.keys.every((k) => typeof k === 'string') &&
    typeof v.checked === 'boolean' &&
    typeof v.at === 'string'
  );
}

function load(): ShopOutboxEntry[] {
  const raw = kv.getJSON(KV_KEYS.shopOutbox);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

let queue: ShopOutboxEntry[] | null = null;
/** The entry being sent right now (compaction never edits it). */
let inFlight: ShopOutboxEntry | null = null;
let flushing: Promise<ShopFlushResult> | null = null;
const listeners = new Set<() => void>();

function current(): ShopOutboxEntry[] {
  queue ??= load();
  return queue;
}

function save(next: ShopOutboxEntry[]): void {
  queue = next;
  if (next.length === 0) kv.remove(KV_KEYS.shopOutbox);
  else kv.setJSON(KV_KEYS.shopOutbox, next);
  for (const listener of listeners) listener();
}

/** Applies the outbox's ticks, in order, on top of a list's checked keys (the UI's view of them). */
export function withPendingToggles(
  checkedKeys: readonly string[],
  entries: readonly ShopOutboxEntry[],
  planId: string | null | undefined,
): string[] {
  const mine = entries.filter((e) => e.planId === planId);
  if (mine.length === 0) return checkedKeys as string[];
  const checked = new Set(checkedKeys);
  for (const entry of mine) {
    for (const key of entry.keys) {
      if (entry.checked) checked.add(key);
      else checked.delete(key);
    }
  }
  return [...checked];
}

export const shopOutbox = {
  /** The waiting entries, oldest first (a stable array between changes). */
  entries(): readonly ShopOutboxEntry[] {
    return current();
  },

  /** Keys of a plan with a tick the server has not accepted yet. */
  pendingKeys(planId: string | null | undefined): Set<string> {
    return new Set(current().flatMap((e) => (e.planId === planId ? e.keys : [])));
  },

  /**
   * Adds a tick. An older waiting tick of the same key is superseded (the newer one is sent anyway and
   * wins by `at`), so the outbox never grows past one entry per key.
   */
  enqueue(entry: ShopOutboxEntry): void {
    if (entry.keys.length === 0) return;
    const keys = new Set(entry.keys);
    const compacted = current().flatMap((e) => {
      if (e === inFlight || e.planId !== entry.planId) return [e];
      const rest = e.keys.filter((k) => !keys.has(k));
      if (rest.length === e.keys.length) return [e];
      return rest.length > 0 ? [{ ...e, keys: rest }] : [];
    });
    save([...compacted, { ...entry, keys: [...entry.keys] }]);
  },

  /**
   * Sends the waiting entries in order, one at a time. Stops at the first one that must be retried
   * (offline, server down) and leaves it and everything after it waiting. A second call while a flush
   * runs joins it.
   */
  flush(send: ShopOutboxSend): Promise<ShopFlushResult> {
    if (flushing) return flushing;
    const run = async (): Promise<ShopFlushResult> => {
      const result: ShopFlushResult = { sent: 0, dropped: [], blocked: false };
      for (;;) {
        const head = current()[0];
        if (!head) return result;
        inFlight = head;
        try {
          await send(head);
          result.sent += 1;
        } catch (error) {
          if (shopSendFailure(error) === 'retry') {
            result.blocked = true;
            return result;
          }
          result.dropped.push(head);
        } finally {
          inFlight = null;
        }
        save(current().filter((e) => e !== head));
      }
    };
    flushing = run().finally(() => {
      flushing = null;
    });
    return flushing;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Re-reads the KV store (sign-out wiped it; tests swap the backend). */
  reload(): void {
    queue = null;
    inFlight = null;
    for (const listener of listeners) listener();
  },
};
