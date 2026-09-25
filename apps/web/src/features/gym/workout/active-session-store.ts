import { useSyncExternalStore } from 'react';
import type { WorkoutSessionDoc } from '@chefer/types';
import { createExternalStore, type ExternalStore } from './external-store';
import { getStorage, GYM_KEYS } from './storage';

// The in-progress workout, written to localStorage on EVERY reducer action
// (gym_plan.md §5.2 on web): closing the tab, a crash or a reload between two
// clicks loses nothing. Cleared only after the finished / discarded doc has
// been handed to the outbox (use-active-workout.ts owns that ordering).

export interface ActiveSessionRecord {
  v: 1;
  /** Gym owner (user id) when the session started; null if unknown then. */
  ownerId: string | null;
  doc: WorkoutSessionDoc;
}

export interface ActiveSessionStore {
  get: () => ActiveSessionRecord | null;
  set: (doc: WorkoutSessionDoc, ownerId: string | null) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Re-read storage (another tab wrote it). */
  reload: () => void;
}

function isRecord(value: unknown): value is ActiveSessionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { v, doc } = value as { v?: unknown; doc?: unknown };
  if (v !== 1 || typeof doc !== 'object' || doc === null) return false;
  const { id, exercises } = doc as { id?: unknown; exercises?: unknown };
  return typeof id === 'string' && Array.isArray(exercises);
}

export function createActiveSessionStore(key: string = GYM_KEYS.activeSession): ActiveSessionStore {
  const load = (): ActiveSessionRecord | null => {
    const storage = getStorage();
    const raw = storage.getItem(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) return parsed;
    } catch {
      // fall through to quarantine
    }
    // Never silently drop a workout: park the unreadable payload.
    storage.setItem(`${GYM_KEYS.activeSessionQuarantine}.${Date.now()}`, raw);
    storage.removeItem(key);
    return null;
  };

  const store: ExternalStore<ActiveSessionRecord | null> = createExternalStore(load);

  return {
    get: store.get,
    set(doc, ownerId) {
      const record: ActiveSessionRecord = { v: 1, ownerId, doc };
      getStorage().setItem(key, JSON.stringify(record));
      store.set(record);
    },
    clear() {
      getStorage().removeItem(key);
      store.set(null);
    },
    subscribe: store.subscribe,
    reload: store.reset,
  };
}

export const activeSessionStore = createActiveSessionStore();

const serverSnapshot = () => null;

/** The in-progress record (null during SSR and the hydration render). */
export function useActiveSessionRecord(): ActiveSessionRecord | null {
  return useSyncExternalStore(activeSessionStore.subscribe, activeSessionStore.get, serverSnapshot);
}
