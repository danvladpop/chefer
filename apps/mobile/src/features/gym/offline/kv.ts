import { SQLiteStorage } from 'expo-sqlite/kv-store';

// Thin JSON wrapper over expo-sqlite's key-value store (gym_plan.md §5.2).
// The sync API matters: the active workout is written with setItemSync on
// every tap, so a crash or kill a millisecond later still finds it on disk.
// Jest has no native SQLite — the probe below falls back to an in-memory map
// there (and would on a device only if SQLite itself were unusable).

export interface KvBackend {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): unknown;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  removeItemAsync(key: string): Promise<unknown>;
}

/** Dedicated database so gym state never collides with other KV users. */
const DATABASE_NAME = 'chefer-gym.db';
const PROBE_KEY = '__chefer_kv_probe__';

export function createMemoryKvBackend(): KvBackend {
  const map = new Map<string, string>();
  return {
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => {
      map.set(key, value);
    },
    removeItemSync: (key) => map.delete(key),
    getItemAsync: (key) => Promise.resolve(map.get(key) ?? null),
    setItemAsync: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    removeItemAsync: (key) => Promise.resolve(map.delete(key)),
  };
}

let backend: KvBackend | undefined;
let persistent = false;

function openSqliteBackend(): KvBackend | null {
  try {
    const storage = new SQLiteStorage(DATABASE_NAME);
    storage.setItemSync(PROBE_KEY, '1');
    if (storage.getItemSync(PROBE_KEY) !== '1') {
      return null;
    }
    storage.removeItemSync(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

/** The process-wide backend, opened lazily on first use. */
export function getKvBackend(): KvBackend {
  if (!backend) {
    const sqlite = openSqliteBackend();
    persistent = sqlite !== null;
    backend = sqlite ?? createMemoryKvBackend();
  }
  return backend;
}

/** False when running on the in-memory fallback (tests; a broken SQLite). */
export function isKvPersistent(): boolean {
  getKvBackend();
  return persistent;
}

/** Test seam: swap the backend (pass undefined to reopen the default). */
export function setKvBackendForTests(next: KvBackend | undefined): void {
  backend = next;
  persistent = false;
}

/** Synchronous JSON helpers. Corrupt JSON reads as null (callers quarantine). */
export const kv = {
  getString(key: string): string | null {
    return getKvBackend().getItemSync(key);
  },
  setString(key: string, value: string): void {
    getKvBackend().setItemSync(key, value);
  },
  getJSON(key: string): unknown {
    const raw = getKvBackend().getItemSync(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown): void {
    getKvBackend().setItemSync(key, JSON.stringify(value));
  },
  remove(key: string): void {
    getKvBackend().removeItemSync(key);
  },
};

/**
 * AsyncStorage-shaped adapter (for the TanStack query persister). Async so
 * large cache writes don't block the JS thread.
 */
export const kvAsyncStorage = {
  getItem: (key: string): Promise<string | null> => getKvBackend().getItemAsync(key),
  setItem: (key: string, value: string): Promise<void> => getKvBackend().setItemAsync(key, value),
  removeItem: async (key: string): Promise<void> => {
    await getKvBackend().removeItemAsync(key);
  },
};
