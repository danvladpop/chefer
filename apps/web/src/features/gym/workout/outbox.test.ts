import { describe, expect, it, vi } from 'vitest';
import type { SyncResultDto, WorkoutSessionDoc } from '@chefer/types';
import { startSession, workoutReducer } from '@chefer/utils';
import { createOutbox, pendingFinishedDocs, selectOutboxStatus, type SendDocs } from './outbox';
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
