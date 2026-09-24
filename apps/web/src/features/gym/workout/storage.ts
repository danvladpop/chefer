// ─── Web storage adapter for the gym offline layer ───────────────────────────
// localStorage behind a synchronous key/value interface (the same shape the
// phone's expo-sqlite kv-store gives the mobile outbox). Every access is
// wrapped: private mode, a full quota or disabled site data must never break
// the workout page — it falls back to memory, so the session still works for
// as long as the tab stays open.

export interface KvStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export const GYM_KEYS = {
  activeSession: 'chefer.gym.active-session',
  activeSessionQuarantine: 'chefer.gym.active-session.quarantine',
  outbox: 'chefer.gym.outbox',
  outboxQuarantine: 'chefer.gym.outbox.quarantine',
  owner: 'chefer.gym.owner',
  restTimer: 'chefer.gym.rest-timer',
  /** The last finished doc, so its summary still renders after the outbox acked it. */
  lastFinished: 'chefer.gym.last-finished',
  pauses: 'chefer.gym.pauses',
} as const;

export function createMemoryStorage(): KvStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const memory = createMemoryStorage();
/** Keys whose last localStorage write failed: memory holds the newer copy. */
const memoryWins = new Set<string>();

function local(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // SecurityError when site data is blocked
  }
}

/**
 * localStorage with a memory fallback. A write that fails (quota, blocked
 * storage) still lands in memory, and reads of that key prefer memory from
 * then on — so the tab never reads back an older copy than it wrote.
 */
export const webStorage: KvStorage = {
  getItem(key) {
    const ls = local();
    if (ls && !memoryWins.has(key)) {
      try {
        return ls.getItem(key);
      } catch {
        // fall through to memory
      }
    }
    return memory.getItem(key);
  },
  setItem(key, value) {
    memory.setItem(key, value);
    const ls = local();
    try {
      if (!ls) throw new Error('no localStorage');
      ls.setItem(key, value);
      memoryWins.delete(key);
    } catch {
      memoryWins.add(key);
    }
  },
  removeItem(key) {
    memory.removeItem(key);
    const ls = local();
    try {
      ls?.removeItem(key);
      memoryWins.delete(key);
    } catch {
      memoryWins.add(key);
    }
  },
};

let backend: KvStorage = webStorage;

export function getStorage(): KvStorage {
  return backend;
}

/** Test seam: swap the backend (memory storage in Vitest). */
export function setStorageForTests(next: KvStorage | null): void {
  backend = next ?? webStorage;
}

export function readJson(storage: KvStorage, key: string): unknown {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
