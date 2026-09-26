import { useSyncExternalStore } from 'react';
import {
  mergePendingRebalance,
  parsePendingRebalance,
  type PendingRebalance,
  type RebalanceResultLike,
} from '@chefer/utils';
import { kv } from '../gym/offline/kv';

// Pending week-rebalance undo (F4, audit TRK-3) — mobile counterpart of web's
// rebalance-storage. Every logging surface (tracker save, quick add, photo
// scan, cook-mode log) feeds its result through recordRebalance; the banner
// on the tracker, cook finish and Plan tab reads it back. Persisted in the
// app's SQLite KV (sync, survives a restart) and MERGED rather than
// overwritten, so a second rebalance keeps the first one's undo (F-TRK-3-2).

const STORAGE_KEY = 'chefer.rebalance.pending';

const listeners = new Set<() => void>();
let cached: PendingRebalance | null | undefined;

function read(): PendingRebalance | null {
  if (cached === undefined) {
    let raw: unknown = null;
    try {
      raw = kv.getJSON(STORAGE_KEY);
    } catch {
      raw = null;
    }
    cached = parsePendingRebalance(raw);
  }
  return cached;
}

function write(next: PendingRebalance | null): void {
  cached = next;
  try {
    if (next) {
      kv.setJSON(STORAGE_KEY, next);
    } else {
      kv.remove(STORAGE_KEY);
    }
  } catch {
    /* the banner still shows this session — the swaps themselves are applied */
  }
  listeners.forEach((listener) => listener());
}

/** Folds a log mutation's `rebalance` into the pending undo. Safe with null. */
export function recordRebalance(result: RebalanceResultLike | null | undefined): void {
  const current = read();
  const next = mergePendingRebalance(current, result);
  if (next !== current) {
    write(next);
  }
}

export function clearPendingRebalance(): void {
  write(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The pending undo, re-rendering every mounted banner when it changes. */
export function usePendingRebalance(): PendingRebalance | null {
  return useSyncExternalStore(subscribe, read, read);
}

/** Test seam: forget the in-memory copy so the next read hits storage. */
export function resetRebalanceStoreForTests(): void {
  cached = undefined;
  listeners.clear();
}
