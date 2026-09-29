import { useSyncExternalStore } from 'react';
import type { WorkoutSessionDoc } from '@chefer/types';
import { createExternalStore, type ExternalStore } from './external-store';
import { KV_KEYS } from './keys';
import { getKvBackend } from './kv';

// The in-progress workout (gym_plan.md §5.2): written with setItemSync on
// EVERY change, so killing the app — or the phone dying — between two taps
// loses nothing. Cleared only after the finished/discarded doc has been handed
// to the outbox (use-active-workout.ts does that ordering).

export interface ActiveSessionRecord {
  v: 1;
  /** gym owner (user id) when the session started; null if unknown then. */
  ownerId: string | null;
  doc: WorkoutSessionDoc;
  /**
   * "Save for later" (UX-36 A1/T-36.3): device-only, never uploaded — the
   * instant the session was paused, or null while active/backfilling. Kept
   * across every `set()` (a dispatch never clears a pause); only
   * `setPausedAt` changes it.
   */
  pausedAt: string | null;
}

export interface ActiveSessionStore {
  get: () => ActiveSessionRecord | null;
  /** Persist synchronously, then notify subscribers. Preserves any existing `pausedAt`. */
  set: (doc: WorkoutSessionDoc, ownerId: string | null) => void;
  /** "Save for later" / resume: sets or clears `pausedAt` on the current record (no-op if none). */
  setPausedAt: (pausedAt: string | null) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

function isRecord(value: unknown): value is ActiveSessionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { v, doc } = value as { v?: unknown; doc?: unknown };
  if (v !== 1 || typeof doc !== 'object' || doc === null) return false;
  const { id, exercises } = doc as { id?: unknown; exercises?: unknown };
  return typeof id === 'string' && Array.isArray(exercises);
}

export function createActiveSessionStore(key: string = KV_KEYS.activeSession): ActiveSessionStore {
  const load = (): ActiveSessionRecord | null => {
    const storage = getKvBackend();
    const raw = storage.getItemSync(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        // Older stored payloads (pre-T-36.A1.1) have no `pausedAt` — default null.
        return { ...parsed, pausedAt: parsed.pausedAt ?? null };
      }
    } catch {
      // fall through to quarantine
    }
    // Never silently drop a workout: park the unreadable payload for support.
    storage.setItemSync(`${KV_KEYS.activeSessionQuarantine}.${Date.now()}`, raw);
    storage.removeItemSync(key);
    return null;
  };

  const store: ExternalStore<ActiveSessionRecord | null> = createExternalStore(load);

  return {
    get: store.get,
    set(doc, ownerId) {
      const pausedAt = store.get()?.pausedAt ?? null;
      const record: ActiveSessionRecord = { v: 1, ownerId, doc, pausedAt };
      getKvBackend().setItemSync(key, JSON.stringify(record));
      store.set(record);
    },
    setPausedAt(pausedAt) {
      const current = store.get();
      if (!current) return;
      const record: ActiveSessionRecord = { ...current, pausedAt };
      getKvBackend().setItemSync(key, JSON.stringify(record));
      store.set(record);
    },
    clear() {
      getKvBackend().removeItemSync(key);
      store.set(null);
    },
    subscribe: store.subscribe,
  };
}

/** The app-wide instance. */
export const activeSessionStore = createActiveSessionStore();

/** The in-progress session doc (null when no workout is running). */
export function useActiveSessionRecord(): ActiveSessionRecord | null {
  return useSyncExternalStore(activeSessionStore.subscribe, activeSessionStore.get);
}

/** "Save for later" instant of the active session, or null (T-36.A1.1/T-36.3). */
export function useActiveSessionPausedAt(): string | null {
  return useSyncExternalStore(
    activeSessionStore.subscribe,
    () => activeSessionStore.get()?.pausedAt ?? null,
  );
}
