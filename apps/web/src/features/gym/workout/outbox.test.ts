import { describe, expect, it, vi } from 'vitest';
import type { SyncResultDto, WorkoutSessionDoc } from '@chefer/types';
import { startSession, workoutReducer } from '@chefer/utils';
import {
  createOutbox,
  pendingDocs,
  pendingFinishedDocs,
  selectOutboxStatus,
  type SendDocs,
} from './outbox';
import { createMemoryStorage, GYM_KEYS, type KvStorage } from './storage';

let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

function finishedDoc(at = '2026-09-24T10:00:00.000Z'): WorkoutSessionDoc {
  const doc = startSession({
    id: uuid(),
    newId: uuid,
    now: '2026-09-24T09:00:00.000Z',
    localDate: '2026-09-24',
    routineId: null,
    routineDayId: null,
    name: 'Freestyle workout',
    isDeload: false,
    exercises: [],
  });
  return workoutReducer(doc, { type: 'finish', at });
}

function setup(opts: { owner?: string | null; online?: boolean; storage?: KvStorage } = {}) {
  const storage = opts.storage ?? createMemoryStorage();
  let owner = opts.owner === undefined ? 'user-a' : opts.owner;
  let online = opts.online ?? true;
  let clock = Date.parse('2026-09-24T12:00:00.000Z');
  const box = createOutbox({
    storage: () => storage,
    now: () => clock,
    isOnline: () => online,
    getOwnerId: () => owner,
    flushOnEnqueue: false,
  });
  return {
    box,
    storage,
    setOwner: (o: string | null) => {
      owner = o;
    },
    setOnline: (v: boolean) => {
      online = v;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const ack =
  (status: SyncResultDto['status'], reason?: string): SendDocs =>
  (docs) =>
    Promise.resolve(
      docs.map(
        (d): SyncResultDto => (reason ? { id: d.id, status, reason } : { id: d.id, status }),
      ),
    );

describe('web outbox', () => {
  it('removes an entry on an applied ack and reports the synced ids', async () => {
    const { box } = setup();
    const onSynced = vi.fn();
    box.configure({ send: ack('applied'), onSynced });
    const doc = finishedDoc();
    box.enqueue(doc);

    const result = await box.flush({ force: true });

    expect(result).toMatchObject({ status: 'ok', applied: 1 });
    expect(box.getState().entries).toHaveLength(0);
    expect(box.getState().lastSyncAt).not.toBeNull();
    expect(onSynced).toHaveBeenCalledWith([doc.id]);
  });

  it('also removes an entry on a stale ack (the server already has newer data)', async () => {
    const { box } = setup();
    box.configure({ send: ack('stale') });
    box.enqueue(finishedDoc());
    const result = await box.flush({ force: true });
    expect(result.stale).toBe(1);
    expect(box.getState().entries).toHaveLength(0);
  });

  it('parks a rejected entry with a visible reason and never resends it automatically', async () => {
    const { box } = setup();
    const send = vi.fn(ack('rejected', 'unknown_exercise:foo'));
    box.configure({ send });
    const doc = finishedDoc();
    box.enqueue(doc);

    const first = await box.flush({ force: true });
    expect(first.parked).toBe(1);
    const [entry] = box.getState().entries;
    expect(entry?.parkedReason).toBe('rejected: unknown_exercise:foo');

    const status = selectOutboxStatus(box.getState(), 'user-a', false);
    expect(status.pending).toBe(0);
    expect(status.parked).toHaveLength(1);

    send.mockClear();
    const second = await box.flush({ force: true });
    expect(second).toMatchObject({ status: 'skipped', reason: 'empty' });
    expect(send).not.toHaveBeenCalled();
  });

  it('retryParked un-parks and resends; discardParked is the only way out without an ack', async () => {
    const { box } = setup();
    box.configure({ send: ack('rejected', 'nope') });
    const a = finishedDoc();
    const b = finishedDoc();
    box.enqueue(a);
    box.enqueue(b);
    await box.flush({ force: true });
    expect(box.getState().entries.every((e) => e.parkedReason)).toBe(true);

    box.configure({ send: ack('applied') });
    await box.retryParked(a.id);
    expect(box.getState().entries.map((e) => e.doc.id)).toEqual([b.id]);

    expect(box.discardParked(b.id)?.doc.id).toBe(b.id);
    expect(box.getState().entries).toHaveLength(0);
    // Discard refuses entries that are not parked.
    box.enqueue(finishedDoc());
    expect(box.discardParked(box.getState().entries[0]!.doc.id)).toBeNull();
  });

  it('keeps everything on a network error and backs off', async () => {
    const { box, advance } = setup();
    box.configure({
      send: () => Promise.reject(new Error('Failed to fetch')),
    });
    box.enqueue(finishedDoc());

    const result = await box.flush({ force: true });
    expect(result).toMatchObject({ status: 'error', failed: 1 });
    expect(box.getState().entries).toHaveLength(1);
    expect(box.getState().entries[0]?.attempts).toBe(1);
    expect(box.getState().failures).toBe(1);

    // A non-forced flush inside the backoff window is skipped…
    expect((await box.flush()).reason).toBe('backoff');
    // …and runs again once the window has passed.
    advance(6_000);
    expect((await box.flush()).status).toBe('error');
  });

  it('isolates a malformed doc: parks it locally instead of poisoning the batch', async () => {
    const { box } = setup();
    const send = vi.fn(ack('applied'));
    box.configure({ send });
    const good = finishedDoc();
    const bad = { ...finishedDoc(), name: '' };
    box.enqueue(good);
    box.enqueue(bad);

    const result = await box.flush({ force: true });
    expect(result).toMatchObject({ applied: 1, parked: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].map((d: WorkoutSessionDoc) => d.id)).toEqual([good.id]);
    expect(box.getState().entries[0]?.parkedReason).toMatch(/^invalid:/);
  });

  it("never uploads another account's entries", async () => {
    const { box, setOwner } = setup({ owner: 'user-b' });
    const send = vi.fn(ack('applied'));
    box.configure({ send });
    box.enqueue(finishedDoc(), { ownerId: 'user-a' });

    expect((await box.flush({ force: true })).reason).toBe('empty');
    expect(send).not.toHaveBeenCalled();
    expect(selectOutboxStatus(box.getState(), 'user-b', false).otherAccount).toBe(1);

    setOwner('user-a');
    expect((await box.flush({ force: true })).applied).toBe(1);
  });

  it('waits for a confirmed owner and for the connection', async () => {
    const { box, setOwner, setOnline } = setup({ owner: null, online: false });
    box.configure({ send: ack('applied') });
    box.enqueue(finishedDoc(), { ownerId: 'user-a' });

    expect((await box.flush({ force: true })).reason).toBe('no-owner');
    setOwner('user-a');
    expect((await box.flush({ force: true })).reason).toBe('offline');
    setOnline(true);
    expect((await box.flush({ force: true })).applied).toBe(1);
  });

  it('an older copy never overwrites a newer queued one; a newer copy un-parks it', async () => {
    const { box } = setup();
    const newer = finishedDoc('2026-09-24T10:30:00.000Z');
    const older = { ...newer, clientUpdatedAt: '2026-09-24T10:00:00.000Z', notes: 'old' };
    box.enqueue(newer);
    box.enqueue(older);
    expect(box.getState().entries[0]?.doc.notes).toBeNull();

    box.configure({ send: ack('rejected') });
    await box.flush({ force: true });
    expect(box.getState().entries[0]?.parkedReason).toBeDefined();
    box.enqueue({ ...newer, clientUpdatedAt: '2026-09-24T11:00:00.000Z', notes: 'fixed' });
    expect(box.getState().entries[0]?.parkedReason).toBeUndefined();
    expect(box.getState().entries[0]?.doc.notes).toBe('fixed');
  });

  it('persists every mutation to storage and quarantines an unreadable queue', () => {
    const storage = createMemoryStorage();
    const { box } = setup({ storage });
    box.enqueue(finishedDoc());
    const raw = storage.getItem(GYM_KEYS.outbox);
    expect((JSON.parse(raw!) as { entries: unknown[] }).entries).toHaveLength(1);

    storage.setItem(GYM_KEYS.outbox, '{not json');
    box.reload();
    expect(box.getState().entries).toHaveLength(0);
    // The unreadable bytes are kept aside, not dropped.
    const reloaded = createOutbox({ storage: () => storage, now: () => 1 });
    storage.setItem(GYM_KEYS.outbox, '{still not json');
    reloaded.getState();
    expect(storage.getItem(`${GYM_KEYS.outboxQuarantine}.1`)).toBe('{still not json');
  });

  it('pendingFinishedDocs lists only unparked COMPLETED docs of the owner', () => {
    const { box } = setup();
    const done = finishedDoc();
    box.enqueue(done, { ownerId: 'user-a' });
    box.enqueue(finishedDoc(), { ownerId: 'user-b' });
    const discarded = workoutReducer(
      { ...finishedDoc(), status: 'IN_PROGRESS' },
      {
        type: 'discard',
        at: '2026-09-24T10:00:00.000Z',
      },
    );
    box.enqueue(discarded, { ownerId: 'user-a' });
    expect(pendingFinishedDocs(box.getState(), 'user-a').map((d) => d.id)).toEqual([done.id]);
  });
});

describe('web outbox — hold / Undo / stale (UX-44, T-44.5)', () => {
  it('a held entry is not flushed before holdUntil, even when forced; then it goes out', async () => {
    const { box, advance } = setup();
    const send = vi.fn(ack('applied'));
    box.configure({ send });
    const doc = finishedDoc();
    box.enqueue(doc, {
      holdUntil: new Date(Date.parse('2026-09-24T12:00:00.000Z') + 8_000).toISOString(),
    });

    expect((await box.flush({ force: true })).reason).toBe('empty');
    expect(send).not.toHaveBeenCalled();

    advance(9_000);
    expect((await box.flush({ force: true })).applied).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cancelHeld (Undo) removes a held entry so nothing is ever sent, and is a no-op after the hold', async () => {
    const { box, advance } = setup();
    const send = vi.fn(ack('applied'));
    box.configure({ send });
    const doc = finishedDoc();
    box.enqueue(doc, {
      holdUntil: new Date(Date.parse('2026-09-24T12:00:00.000Z') + 8_000).toISOString(),
    });
    expect(box.cancelHeld(doc.id)?.doc.id).toBe(doc.id);
    expect(box.getState().entries).toHaveLength(0);
    advance(20_000);
    await box.flush({ force: true });
    expect(send).not.toHaveBeenCalled();

    const later = finishedDoc();
    box.enqueue(later, {
      holdUntil: new Date(Date.parse('2026-09-24T12:00:00.000Z') + 28_000).toISOString(),
    });
    advance(30_000);
    expect(box.cancelHeld(later.id)).toBeNull();
  });

  it('pendingDocs includes a DISCARDED tombstone (pendingFinishedDocs does not); a stale ack reaches onStale and onSynced', async () => {
    const { box } = setup();
    const doc = finishedDoc();
    const tomb = { ...doc, status: 'DISCARDED' as const, exercises: [] };
    box.enqueue(tomb);
    expect(pendingDocs(box.getState(), 'user-a').map((d) => d.status)).toEqual(['DISCARDED']);
    expect(pendingFinishedDocs(box.getState(), 'user-a')).toEqual([]);

    const onSynced = vi.fn();
    const onStale = vi.fn();
    box.configure({ send: ack('stale'), onSynced, onStale });
    await box.flush({ force: true });
    expect(onStale).toHaveBeenCalledWith([tomb.id]);
    expect(onSynced).toHaveBeenCalledWith([tomb.id]);
  });
});

// UX-GYM-23 (WP-02): an ack for an older copy must not drop a newer edit that
// was queued while the upload was in flight. Mirrors the phone's outbox test.
describe('web outbox — ack for an older copy (UX-GYM-23)', () => {
  const NEWER = '2026-09-24T10:05:00.000Z';

  it('keeps the newer entry when the older copy is acked, then sends it next', async () => {
    const { box } = setup();
    const older = finishedDoc();
    const newer = { ...older, clientUpdatedAt: NEWER, notes: 'edited while uploading' };
    let release: (docs: WorkoutSessionDoc[]) => void = () => undefined;
    const first = new Promise<SyncResultDto[]>((resolve) => {
      release = (docs) => resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const })));
    });
    const send = vi
      .fn<Parameters<SendDocs>, ReturnType<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockImplementation((docs) =>
        Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
      );
    box.configure({ send });
    box.enqueue(older);

    const flushing = box.flush({ force: true });
    box.enqueue(newer); // queued while the first request is in flight
    release([older]);
    await flushing;

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0][0]?.clientUpdatedAt).toBe(NEWER);
    expect(box.getState().entries).toHaveLength(0);
  });

  it('does not drop the newer entry even if sending it fails afterwards', async () => {
    const { box } = setup();
    const older = finishedDoc();
    const newer = { ...older, clientUpdatedAt: NEWER };
    let release: (docs: WorkoutSessionDoc[]) => void = () => undefined;
    const first = new Promise<SyncResultDto[]>((resolve) => {
      release = (docs) => resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const })));
    });
    const send = vi
      .fn<Parameters<SendDocs>, ReturnType<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockRejectedValue(new TypeError('Failed to fetch'));
    box.configure({ send });
    box.enqueue(older);

    const flushing = box.flush({ force: true });
    box.enqueue(newer);
    release([older]);
    await flushing;

    const [entry] = box.getState().entries;
    expect(entry?.doc.clientUpdatedAt).toBe(NEWER);
    expect(entry?.parkedReason).toBeUndefined();
  });
});

// UX-GYM-25 (WP-02): a workout the server keeps failing on is isolated and
// parked after a few rounds so it cannot block the others.
describe('web outbox — a failing item is parked (UX-GYM-25)', () => {
  const serverDown = () => Object.assign(new Error('boom'), { data: { httpStatus: 500 } });

  it('after 3 failed rounds sends one by one, delivers the rest and parks the failing one', async () => {
    const { box, advance } = setup();
    const bad = finishedDoc();
    const send = vi.fn<Parameters<SendDocs>, ReturnType<SendDocs>>((docs) =>
      docs.some((d) => d.id === bad.id)
        ? Promise.reject(serverDown())
        : Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
    );
    box.configure({ send });
    box.enqueue(bad);
    box.enqueue(finishedDoc());
    box.enqueue(finishedDoc());

    for (let round = 1; round <= 2; round++) {
      expect((await box.flush({ force: true })).status).toBe('error');
      expect(box.getState().entries.every((e) => !e.parkedReason)).toBe(true);
      advance(60_000);
    }
    expect(box.getState().entries).toHaveLength(3);

    const third = await box.flush({ force: true });
    expect(third).toMatchObject({ applied: 2, parked: 1 });
    expect(box.getState().entries.map((e) => e.doc.id)).toEqual([bad.id]);
    expect(box.getState().entries[0]?.parkedReason).toContain("couldn't save");
    expect(box.getState()).toMatchObject({ failures: 0, nextAttemptAt: null });
  });

  it('does not park anything while the whole server is down, or on network errors', async () => {
    const { box } = setup();
    box.configure({
      send: vi.fn<Parameters<SendDocs>, ReturnType<SendDocs>>(() => Promise.reject(serverDown())),
    });
    box.enqueue(finishedDoc());
    box.enqueue(finishedDoc());
    for (let i = 0; i < 5; i++) await box.flush({ force: true });
    expect(box.getState().entries.every((e) => !e.parkedReason)).toBe(true);

    box.configure({
      send: vi.fn<Parameters<SendDocs>, ReturnType<SendDocs>>(() =>
        Promise.reject(new TypeError('Failed to fetch')),
      ),
    });
    for (let i = 0; i < 5; i++) await box.flush({ force: true });
    expect(box.getState().entries.every((e) => !e.parkedReason)).toBe(true);
  });
});
