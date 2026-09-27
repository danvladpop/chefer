import {
  activeSessionStore,
  createActiveSessionStore,
  useActiveSessionPausedAt,
} from '../../src/features/gym/offline/active-session-store';
import {
  createMemoryKvBackend,
  getKvBackend,
  setKvBackendForTests,
} from '../../src/features/gym/offline/kv';
import { activeDoc } from './gym-workout-helpers';

// T-36.A1.1 / T-36.3: `pausedAt` is device-only and lives on the active
// session's KV record, kept across every `set()` (a dispatch never clears a
// pause) and changed only through `setPausedAt`.

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  activeSessionStore.clear();
});

describe('activeSessionStore pausedAt', () => {
  it('defaults to null for a freshly started session', () => {
    activeSessionStore.set(activeDoc(), 'user-a');
    expect(activeSessionStore.get()?.pausedAt).toBeNull();
  });

  it('setPausedAt sets it, and a later set() (a dispatch) preserves it', () => {
    const doc = activeDoc();
    activeSessionStore.set(doc, 'user-a');
    activeSessionStore.setPausedAt('2026-09-28T18:23:00.000Z');
    expect(activeSessionStore.get()?.pausedAt).toBe('2026-09-28T18:23:00.000Z');

    activeSessionStore.set({ ...doc, notes: 'updated by a dispatch' }, 'user-a');
    expect(activeSessionStore.get()?.pausedAt).toBe('2026-09-28T18:23:00.000Z');
  });

  it('setPausedAt(null) resumes (clears the pause)', () => {
    activeSessionStore.set(activeDoc(), 'user-a');
    activeSessionStore.setPausedAt('2026-09-28T18:23:00.000Z');
    activeSessionStore.setPausedAt(null);
    expect(activeSessionStore.get()?.pausedAt).toBeNull();
  });

  it('setPausedAt is a no-op when there is no active session', () => {
    activeSessionStore.setPausedAt('2026-09-28T18:23:00.000Z');
    expect(activeSessionStore.get()).toBeNull();
  });

  it('an older stored payload with no pausedAt field loads as null', () => {
    const key = 'gym.active-session.legacy-test';
    const doc = activeDoc();
    getKvBackend().setItemSync(key, JSON.stringify({ v: 1, ownerId: 'user-a', doc }));
    const legacyStore = createActiveSessionStore(key);
    expect(legacyStore.get()?.pausedAt).toBeNull();
  });
});

describe('useActiveSessionPausedAt', () => {
  it('is exported as a hook (subscribes to the same store)', () => {
    expect(typeof useActiveSessionPausedAt).toBe('function');
  });
});
