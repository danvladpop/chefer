import type { SyncResultDto, WorkoutSessionDoc } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  BACKOFF_MAX_MS,
  backoffDelay,
  createOutbox,
  selectOutboxStatus,
  type OutboxDeps,
  type SendDocs,
} from '../../src/features/gym/offline/outbox';
import { makeDoc } from './gym-fixtures';

const OWNER = 'user-a';

function setup(deps: Partial<OutboxDeps> = {}) {
  let clock = 1_000_000;
  let online = true;
  let owner: string | null = OWNER;
  const outbox = createOutbox({
    now: () => clock,
    isOnline: () => online,
    getOwnerId: () => owner,
    flushOnEnqueue: false,
    ...deps,
  });
  return {
    outbox,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    setOnline: (value: boolean) => {
      online = value;
    },
    setOwner: (value: string | null) => {
      owner = value;
    },
  };
}

/** A sender that answers every doc with the given status (default 'applied'). */
function acking(status: SyncResultDto['status'] | ((doc: WorkoutSessionDoc) => SyncResultDto)) {
  return jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>((docs) =>
    Promise.resolve(
      docs.map((doc) => (typeof status === 'function' ? status(doc) : { id: doc.id, status })),
    ),
  );
}

const ids = (outbox: ReturnType<typeof createOutbox>) =>
  outbox.getState().entries.map((e) => e.doc.id);

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
});

describe('gym outbox — enqueue', () => {
  it('persists synchronously: a fresh instance (app relaunch) sees the queued doc', () => {
    const { outbox } = setup();
    const doc = makeDoc(1);
    outbox.enqueue(doc);

    const relaunched = createOutbox({ getOwnerId: () => OWNER, flushOnEnqueue: false });
    expect(relaunched.getState().entries).toHaveLength(1);
    expect(relaunched.getState().entries[0]).toMatchObject({ doc, ownerId: OWNER, attempts: 0 });
  });

  it('replaces a queued copy with a newer one and ignores an older one', () => {
    const { outbox } = setup();
    outbox.enqueue(makeDoc(1, { clientUpdatedAt: '2026-09-24T09:00:00.000Z', name: 'v2' }));
    outbox.enqueue(makeDoc(1, { clientUpdatedAt: '2026-09-24T08:00:00.000Z', name: 'v1' }));
    expect(outbox.getState().entries).toHaveLength(1);
    expect(outbox.getState().entries[0]?.doc.name).toBe('v2');

    outbox.enqueue(makeDoc(1, { clientUpdatedAt: '2026-09-24T10:00:00.000Z', name: 'v3' }));
    expect(outbox.getState().entries[0]?.doc.name).toBe('v3');
  });

  it('kicks a flush after enqueue by default', async () => {
    const send = acking('applied');
    const outbox = createOutbox({ getOwnerId: () => OWNER });
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1));
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.getState().entries).toHaveLength(0);
  });
});

describe('gym outbox — flush', () => {
  it("removes entries acked 'applied', records lastSyncAt and calls onSynced", async () => {
    const { outbox } = setup();
    const send = acking('applied');
    const onSynced = jest.fn();
    outbox.configure({ send, onSynced });
    outbox.enqueue(makeDoc(1));
    outbox.enqueue(makeDoc(2));

    const result = await outbox.flush();

    expect(result).toMatchObject({ status: 'ok', applied: 2, parked: 0, failed: 0 });
    expect(send).toHaveBeenCalledWith([makeDoc(1), makeDoc(2)]);
    expect(outbox.getState().entries).toHaveLength(0);
    expect(outbox.getState().lastSyncAt).not.toBeNull();
    expect(onSynced).toHaveBeenCalledWith([makeDoc(1).id, makeDoc(2).id]);
  });

  it("removes entries acked 'stale' (the server already has a newer copy)", async () => {
    const { outbox } = setup();
    outbox.configure({ send: acking('stale') });
    outbox.enqueue(makeDoc(1));
    const result = await outbox.flush();
    expect(result.stale).toBe(1);
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it("parks 'rejected' entries — never drops them — and stops auto-sending them", async () => {
    const { outbox } = setup();
    const send = acking((doc) =>
      doc.id === makeDoc(2).id
        ? { id: doc.id, status: 'rejected', reason: 'foreign routine' }
        : { id: doc.id, status: 'applied' },
    );
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1));
    outbox.enqueue(makeDoc(2));

    const result = await outbox.flush();
    expect(result).toMatchObject({ applied: 1, parked: 1 });
    expect(ids(outbox)).toEqual([makeDoc(2).id]);
    const parked = outbox.getState().entries[0];
    expect(parked?.parkedReason).toContain('foreign routine');
    expect(parked?.attempts).toBe(1);

    send.mockClear();
    const again = await outbox.flush({ force: true });
    expect(again).toMatchObject({ status: 'skipped', reason: 'empty' });
    expect(send).not.toHaveBeenCalled();
    const status = selectOutboxStatus(outbox.getState(), OWNER, false);
    expect(status.pending).toBe(0);
    expect(status.parked).toHaveLength(1);
    expect(status.parked[0]?.parkedReason).toBeDefined();
  });

  it('retryParked un-parks and resends; discardParked is the only explicit drop', async () => {
    const { outbox } = setup();
    outbox.configure({ send: acking('rejected') });
    outbox.enqueue(makeDoc(1));
    outbox.enqueue(makeDoc(2));
    await outbox.flush();
    expect(outbox.getState().entries.every((e) => e.parkedReason)).toBe(true);

    outbox.configure({ send: acking('applied') });
    await outbox.retryParked(makeDoc(1).id);
    expect(ids(outbox)).toEqual([makeDoc(2).id]);

    expect(outbox.discardParked(makeDoc(2).id)?.doc.id).toBe(makeDoc(2).id);
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it('parks a doc that fails local schema validation without sending it', async () => {
    const { outbox } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1, { localDate: 'yesterday' }));
    outbox.enqueue(makeDoc(2));

    const result = await outbox.flush();
    expect(result).toMatchObject({ applied: 1, parked: 1 });
    expect(send).toHaveBeenCalledWith([makeDoc(2)]);
    expect(outbox.getState().entries[0]?.parkedReason).toMatch(/^invalid:/);
  });

  it('isolates the culprit when the server rejects a whole batch as BAD_REQUEST', async () => {
    const { outbox } = setup();
    const badRequest = Object.assign(new Error('Invalid input'), {
      data: { code: 'BAD_REQUEST', httpStatus: 400 },
    });
    const send = jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>((docs) =>
      docs.some((d) => d.id === makeDoc(2).id)
        ? Promise.reject(badRequest)
        : Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
    );
    outbox.configure({ send });
    [1, 2, 3].forEach((n) => outbox.enqueue(makeDoc(n)));

    const result = await outbox.flush();
    expect(result).toMatchObject({ applied: 2, parked: 1 });
    expect(ids(outbox)).toEqual([makeDoc(2).id]);
    expect(outbox.getState().entries[0]?.parkedReason).toContain('Invalid input');
  });

  it('keeps everything on a network error and backs off exponentially (capped at 5 min)', async () => {
    const { outbox, advance } = setup();
    const send = jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>(() =>
      Promise.reject(new TypeError('Network request failed')),
    );
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1));

    const first = await outbox.flush();
    expect(first).toMatchObject({ status: 'error', failed: 1 });
    expect(outbox.getState().entries).toHaveLength(1);
    expect(outbox.getState().entries[0]).toMatchObject({
      attempts: 1,
      lastError: 'Network request failed',
    });
    expect(outbox.getState().failures).toBe(1);

    // Scheduled (non-forced) flushes wait out the window…
    advance(backoffDelay(1) - 1);
    expect(await outbox.flush()).toMatchObject({ status: 'skipped', reason: 'backoff' });
    expect(send).toHaveBeenCalledTimes(1);
    // …then retry, doubling the window.
    advance(1);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(outbox.getState().failures).toBe(2);
    // Event triggers (reconnect, foreground, enqueue) force through the window.
    await outbox.flush({ force: true });
    expect(send).toHaveBeenCalledTimes(3);

    expect([1, 2, 3].map(backoffDelay)).toEqual([5_000, 10_000, 20_000]);
    expect(backoffDelay(30)).toBe(BACKOFF_MAX_MS);

    // Recovery resets the backoff.
    outbox.configure({ send: acking('applied') });
    await outbox.flush({ force: true });
    expect(outbox.getState()).toMatchObject({ failures: 0, nextAttemptAt: null, entries: [] });
  });

  it('sends in batches of at most 20', async () => {
    const { outbox } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    for (let n = 1; n <= 45; n++) outbox.enqueue(makeDoc(n));

    const result = await outbox.flush();
    expect(result.applied).toBe(45);
    expect(send.mock.calls.map(([docs]) => docs.length)).toEqual([20, 20, 5]);
  });

  it('stops at the first failed batch and keeps the rest queued', async () => {
    const { outbox } = setup();
    let call = 0;
    const send = jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>((docs) => {
      call++;
      return call === 2
        ? Promise.reject(new Error('502'))
        : Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const })));
    });
    outbox.configure({ send });
    for (let n = 1; n <= 45; n++) outbox.enqueue(makeDoc(n));

    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(outbox.getState().entries).toHaveLength(25);
  });

  it('does nothing offline, without a sender, or before the owner is confirmed', async () => {
    const { outbox, setOnline, setOwner } = setup();
    outbox.enqueue(makeDoc(1));
    expect(await outbox.flush()).toMatchObject({ status: 'skipped', reason: 'no-sender' });

    const send = acking('applied');
    outbox.configure({ send });
    setOnline(false);
    expect(await outbox.flush({ force: true })).toMatchObject({ reason: 'offline' });
    setOnline(true);
    setOwner(null);
    expect(await outbox.flush({ force: true })).toMatchObject({ reason: 'no-owner' });
    expect(send).not.toHaveBeenCalled();
    expect(outbox.getState().entries).toHaveLength(1);
  });

  it("never uploads another account's workouts", async () => {
    const { outbox } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1), { ownerId: 'user-b' });
    outbox.enqueue(makeDoc(2));

    await outbox.flush();
    expect(send).toHaveBeenCalledWith([makeDoc(2)]);
    expect(ids(outbox)).toEqual([makeDoc(1).id]);
    expect(selectOutboxStatus(outbox.getState(), OWNER, false)).toMatchObject({
      pending: 0,
      otherAccount: 1,
    });
  });

  it('is single-flight: concurrent flushes share one pass and pick up late enqueues', async () => {
    const { outbox } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>(async (docs) => {
      await gate;
      return docs.map((d) => ({ id: d.id, status: 'applied' as const }));
    });
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1));

    const a = outbox.flush();
    outbox.enqueue(makeDoc(2)); // arrives mid-flight
    const b = outbox.flush();
    expect(outbox.isFlushing()).toBe(true);
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toBe(rb);
    expect(ra.applied).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(outbox.getState().entries).toHaveLength(0);
    expect(outbox.isFlushing()).toBe(false);
  });
});
