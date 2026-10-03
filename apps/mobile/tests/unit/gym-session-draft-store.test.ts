import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetGymOwnerForTests, setGymOwner } from '../../src/features/gym/offline/owner';
import {
  clearSessionDraft,
  editDraftTarget,
  loadSessionDraft,
  logDraftTarget,
  saveSessionDraft,
} from '../../src/features/gym/workout/session-draft-store';
import { makeDoc } from './gym-fixtures';

// UX-GYM-26 (WP-03): device-local drafts for the past-session edit and log modes.

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  setGymOwner('user-a');
});

describe('session draft store', () => {
  it('round-trips a draft per mode and target', () => {
    const original = makeDoc(1);
    const draft = { ...makeDoc(1), name: 'Edited' };
    saveSessionDraft('edit', editDraftTarget(original.id), original, draft);

    expect(loadSessionDraft('edit', editDraftTarget(original.id))?.draft.name).toBe('Edited');
    expect(loadSessionDraft('edit', editDraftTarget(original.id))?.original.name).toBe(
      original.name,
    );
    // Another mode or target is a different draft.
    expect(loadSessionDraft('log', editDraftTarget(original.id))).toBeNull();
    expect(loadSessionDraft('edit', 'someone-else')).toBeNull();
  });

  it('keys a log by its day and routine day', () => {
    expect(logDraftTarget('2026-10-01', 'day-1')).not.toBe(logDraftTarget('2026-10-01', null));
    expect(logDraftTarget('2026-10-01', 'day-1')).not.toBe(logDraftTarget('2026-10-02', 'day-1'));
  });

  it('clear removes it', () => {
    const doc = makeDoc(1);
    saveSessionDraft('log', 'x', doc, doc);
    clearSessionDraft('log', 'x');
    expect(loadSessionDraft('log', 'x')).toBeNull();
  });

  it('drops a draft abandoned for more than three days', () => {
    const doc = makeDoc(1);
    saveSessionDraft('log', 'x', doc, doc);
    expect(loadSessionDraft('log', 'x', Date.now() + 2 * DAY)).not.toBeNull();
    expect(loadSessionDraft('log', 'x', Date.now() + 4 * DAY)).toBeNull();
    expect(loadSessionDraft('log', 'x')).toBeNull();
  });

  it('removes an unreadable payload instead of crashing', () => {
    const doc = makeDoc(1);
    saveSessionDraft('log', 'x', doc, doc);
    const key = kv.keys().find((k) => k.startsWith('gym.session-draft.'));
    if (!key) throw new Error('expected a stored draft');
    kv.setString(key, '{"v":2}');
    expect(loadSessionDraft('log', 'x')).toBeNull();
    expect(kv.keys().some((k) => k.startsWith('gym.session-draft.'))).toBe(false);
  });

  it('does not leak between accounts', () => {
    const doc = makeDoc(1);
    saveSessionDraft('log', 'x', doc, doc);
    resetGymOwnerForTests();
    setGymOwner('user-b');
    expect(loadSessionDraft('log', 'x')).toBeNull();
  });
});
