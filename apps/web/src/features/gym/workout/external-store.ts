// Module-level store read with useSyncExternalStore (same factory as the
// mobile gym layer), so every gym store behaves alike and a tick in one
// component never re-renders unrelated ones.

export interface ExternalStore<T> {
  /** Current value; `load` runs once, lazily, on first read. */
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
  /** Drop the cached value so the next get() re-runs `load` (tests, other-tab writes). */
  reset: () => void;
}

export function createExternalStore<T>(load: () => T): ExternalStore<T> {
  let cached: { value: T } | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    get() {
      cached ??= { value: load() };
      return cached.value;
    },
    set(value) {
      cached = { value };
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      cached = undefined;
      notify();
    },
  };
}
