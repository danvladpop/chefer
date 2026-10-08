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
import { GENERIC_VALIDATION_MESSAGE } from '../../src/features/gym/validation-copy';
import { makeDoc, uuid } from './gym-fixtures';

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
    // UX-GYM-01: plain words, not the Zod message.
    expect(outbox.getState().entries[0]?.parkedReason).toBe(GENERIC_VALIDATION_MESSAGE);
  });

  it('parks an implausible weight with a message that names the limit (UX-GYM-01)', async () => {
    const { outbox } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    const base = makeDoc(1);
    outbox.enqueue({
      ...base,
      exercises: [
        {
          id: uuid(2),
          exerciseId: 'bench',
          routineExerciseId: null,
          position: 0,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 90,
          skipped: false,
          swappedFromId: null,
          lastSetRir: null,
          notes: null,
          prescription: {
            kind: 'start',
            weightKg: 60,
            reps: [10],
            sets: 1,
            reasonCode: 'START',
            inputs: {},
            deltaKg: 0,
            engineVersion: 1,
          },
          sets: [
            {
              id: uuid(3),
              position: 0,
              weightKg: 1025,
              reps: 10,
              isWarmup: false,
              completedAt: '2026-09-24T08:30:00.000Z',
            },
          ],
        },
      ],
    });

    const result = await outbox.flush();
    expect(result.parked).toBe(1);
    expect(send).not.toHaveBeenCalled();
    const parked = selectOutboxStatus(outbox.getState(), OWNER, false).parked[0];
    expect(parked?.parkedReason).toContain('1000 kg');
    expect(parked?.parkedReason).not.toMatch(/too_big|\[\{/);
  });

  it('a server rejection carrying Zod JSON is parked with plain words, raw text kept in lastError', async () => {
    const { outbox } = setup();
    const raw = JSON.stringify([
      { code: 'too_big', maximum: 1000, path: ['docs', 0, 'exercises', 0, 'sets', 0, 'weightKg'] },
    ]);
    const badRequest = Object.assign(new Error(raw), {
      data: { code: 'BAD_REQUEST', httpStatus: 400 },
    });
    outbox.configure({ send: jest.fn(() => Promise.reject(badRequest)) });
    outbox.enqueue(makeDoc(1));

    await outbox.flush();
    const entry = outbox.getState().entries[0];
    expect(entry?.parkedReason).toContain('1000 kg');
    expect(entry?.parkedReason).not.toContain('too_big');
    expect(entry?.lastError).toBe(raw);
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

describe('gym outbox — holdUntil / Undo (T-44.2, Δ2.3)', () => {
  it('a held entry is not flushed before holdUntil, even when forced', async () => {
    const { outbox, now } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    const doc = makeDoc(1);
    outbox.enqueue(doc, { holdUntil: new Date(now() + 8_000).toISOString() });

    const result = await outbox.flush({ force: true });
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('empty');
    expect(send).not.toHaveBeenCalled();
    expect(ids(outbox)).toEqual([doc.id]);
  });

  it('the entry flushes normally once the hold expires', async () => {
    const { outbox, advance } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    const doc = makeDoc(1);
    outbox.enqueue(doc, { holdUntil: new Date(1_000_000 + 8_000).toISOString() });

    advance(8_001);
    const result = await outbox.flush({ force: true });
    expect(result.status).toBe('ok');
    expect(result.applied).toBe(1);
    expect(send).toHaveBeenCalledWith([doc]);
    expect(outbox.getState().entries).toHaveLength(0);
  });

  it('cancelHeld (Undo) removes a held entry — AC4: Undo within the window sends nothing', async () => {
    const { outbox, now } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    const doc = makeDoc(1);
    outbox.enqueue(doc, { holdUntil: new Date(now() + 8_000).toISOString() });

    const cancelled = outbox.cancelHeld(doc.id);
    expect(cancelled?.doc.id).toBe(doc.id);
    expect(outbox.getState().entries).toHaveLength(0);

    await outbox.flush({ force: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('cancelHeld is a no-op once the hold has already expired', () => {
    const { outbox, advance } = setup();
    const doc = makeDoc(1);
    outbox.enqueue(doc, { holdUntil: new Date(1_000_000 + 8_000).toISOString() });

    advance(8_001);
    expect(outbox.cancelHeld(doc.id)).toBeNull();
    expect(ids(outbox)).toEqual([doc.id]);
  });

  it('a re-enqueue of the same session without holdUntil clears a stale hold (a live edit overtaking a pending delete)', async () => {
    const { outbox, now } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    const held = makeDoc(1, { clientUpdatedAt: '2026-09-24T08:00:00.000Z' });
    outbox.enqueue(held, { holdUntil: new Date(now() + 8_000).toISOString() });

    const edited = makeDoc(1, { clientUpdatedAt: '2026-09-24T09:00:00.000Z', name: 'edited' });
    outbox.enqueue(edited);

    const result = await outbox.flush({ force: true });
    expect(result.status).toBe('ok');
    expect(send).toHaveBeenCalledWith([edited]);
  });

  it('enqueue without holdUntil behaves exactly as before (sendable immediately)', async () => {
    const { outbox } = setup();
    const send = acking('applied');
    outbox.configure({ send });
    outbox.enqueue(makeDoc(1));

    const result = await outbox.flush({ force: true });
    expect(result.status).toBe('ok');
    expect(result.applied).toBe(1);
  });
});

describe('gym outbox — correcting a past session (UX-44)', () => {
  it('a DISCARDED tombstone for an already-sent COMPLETED session is applied and leaves the queue', async () => {
    const { outbox, advance } = setup();
    const completed = makeDoc(3);
    const tombstone = makeDoc(3, {
      status: 'DISCARDED',
      exercises: [],
      clientUpdatedAt: '2026-09-24T10:00:00.000Z',
    });
    const send = acking('applied');
    const onSynced = jest.fn();
    outbox.configure({ send, onSynced });

    outbox.enqueue(completed);
    await outbox.flush({ force: true });
    outbox.enqueue(tombstone, { holdUntil: new Date(1_000_000 + 8_000).toISOString() });
    await outbox.flush({ force: true }); // held: nothing goes out yet
    expect(send).toHaveBeenCalledTimes(1);

    advance(9_000);
    const result = await outbox.flush({ force: true });
    expect(result.applied).toBe(1);
    expect(send).toHaveBeenLastCalledWith([expect.objectContaining({ status: 'DISCARDED' })]);
    expect(ids(outbox)).toEqual([]);
    expect(onSynced).toHaveBeenLastCalledWith([tombstone.id]);
  });

  it("reports a stale ack (another device's newer copy won) through onStale as well as onSynced", async () => {
    const { outbox } = setup();
    const doc = makeDoc(4);
    const onSynced = jest.fn();
    const onStale = jest.fn();
    outbox.configure({ send: acking('stale'), onSynced, onStale });
    outbox.enqueue(doc);
    await outbox.flush({ force: true });
    expect(onStale).toHaveBeenCalledWith([doc.id]);
    expect(onSynced).toHaveBeenCalledWith([doc.id]);
    expect(ids(outbox)).toEqual([]);
  });
});

// UX-GYM-23 (WP-02): an ack for an older copy must not drop a newer edit (or a
// delete) that was queued while the upload was in flight.
describe('gym outbox — ack for an older copy (UX-GYM-23)', () => {
  const OLDER = '2026-09-24T09:00:00.000Z';
  const NEWER = '2026-09-24T09:05:00.000Z';

  function deferredSend() {
    let release: (docs: WorkoutSessionDoc[]) => void = () => undefined;
    const first = new Promise<SyncResultDto[]>((resolve) => {
      release = (docs) => resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const })));
    });
    return { first, release };
  }

  it('keeps the newer entry when the older copy is acked, then sends it next', async () => {
    const { outbox } = setup();
    const older = makeDoc(1, { clientUpdatedAt: OLDER });
    const newer = makeDoc(1, { clientUpdatedAt: NEWER, notes: 'edited while uploading' });
    const { first, release } = deferredSend();
    const send = jest
      .fn<ReturnType<SendDocs>, Parameters<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockImplementation((docs) =>
        Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
      );
    outbox.configure({ send });
    outbox.enqueue(older);

    const flushing = outbox.flush({ force: true });
    outbox.enqueue(newer); // queued while the first request is in flight
    release([older]);
    await flushing;

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0][0]).toMatchObject({ clientUpdatedAt: NEWER });
    expect(ids(outbox)).toEqual([]);
  });

  it('does not drop the newer entry even if sending it fails afterwards', async () => {
    const { outbox } = setup();
    const older = makeDoc(1, { clientUpdatedAt: OLDER });
    const newer = makeDoc(1, { clientUpdatedAt: NEWER, notes: 'edited while uploading' });
    const { first, release } = deferredSend();
    const send = jest
      .fn<ReturnType<SendDocs>, Parameters<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockRejectedValue(new TypeError('Network request failed'));
    outbox.configure({ send });
    outbox.enqueue(older);

    const flushing = outbox.flush({ force: true });
    outbox.enqueue(newer);
    release([older]);
    await flushing;

    // The older ack alone must never have removed the newer copy.
    expect(ids(outbox)).toEqual([older.id]);
    expect(outbox.getState().entries[0]?.doc.clientUpdatedAt).toBe(NEWER);
    expect(outbox.getState().entries[0]?.parkedReason).toBeUndefined();
  });

  it('a delete queued mid-flight survives the ack of the earlier copy', async () => {
    const { outbox } = setup();
    const older = makeDoc(1, { clientUpdatedAt: OLDER });
    const tombstone = makeDoc(1, { clientUpdatedAt: NEWER, status: 'DISCARDED' });
    const { first, release } = deferredSend();
    const send = jest
      .fn<ReturnType<SendDocs>, Parameters<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockRejectedValue(new TypeError('Network request failed'));
    outbox.configure({ send });
    outbox.enqueue(older);

    const flushing = outbox.flush({ force: true });
    outbox.enqueue(tombstone);
    release([older]);
    await flushing;

    expect(outbox.getState().entries[0]?.doc.status).toBe('DISCARDED');
  });

  it('a rejected ack for the older copy does not park the newer one', async () => {
    const { outbox } = setup();
    const older = makeDoc(1, { clientUpdatedAt: OLDER });
    const newer = makeDoc(1, { clientUpdatedAt: NEWER });
    let release: () => void = () => undefined;
    const first = new Promise<SyncResultDto[]>((resolve) => {
      release = () => resolve([{ id: older.id, status: 'rejected', reason: 'old copy invalid' }]);
    });
    const send = jest
      .fn<ReturnType<SendDocs>, Parameters<SendDocs>>()
      .mockReturnValueOnce(first)
      .mockRejectedValue(new TypeError('Network request failed'));
    outbox.configure({ send });
    outbox.enqueue(older);

    const flushing = outbox.flush({ force: true });
    outbox.enqueue(newer);
    release();
    await flushing;

    expect(outbox.getState().entries[0]?.parkedReason).toBeUndefined();
  });
});

// UX-GYM-25 (WP-02): a workout the server keeps failing on is isolated and
// parked after a few rounds so it cannot block the others.
describe('gym outbox — a failing item is parked (UX-GYM-25)', () => {
  const serverDown = () => Object.assign(new Error('boom'), { data: { httpStatus: 500 } });

  /** Server that 500s whenever `bad` is in the request, and applies everything else. */
  function pickySend(badId: string) {
    return jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>((docs) =>
      docs.some((d) => d.id === badId)
        ? Promise.reject(serverDown())
        : Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
    );
  }

  it('after 3 failed rounds sends one by one, delivers the rest and parks the failing one', async () => {
    const { outbox, advance } = setup();
    const bad = makeDoc(1);
    const send = pickySend(bad.id);
    outbox.configure({ send });
    outbox.enqueue(bad);
    outbox.enqueue(makeDoc(2));
    outbox.enqueue(makeDoc(3));

    // Rounds 1 and 2: the whole batch fails; nothing is parked, nothing lost.
    for (let round = 1; round <= 2; round++) {
      const result = await outbox.flush({ force: true });
      expect(result.status).toBe('error');
      expect(outbox.getState().entries.every((e) => !e.parkedReason)).toBe(true);
      advance(60_000);
    }
    expect(outbox.getState().entries).toHaveLength(3);

    // Round 3: the batch fails again, is split, and the others get through.
    const third = await outbox.flush({ force: true });
    expect(third).toMatchObject({ applied: 2, parked: 1 });
    expect(ids(outbox)).toEqual([bad.id]);
    const parked = outbox.getState().entries[0];
    expect(parked?.parkedReason).toContain("couldn't save");
    expect(parked?.lastError).toBe('boom');
    // The queue is healthy again: no backoff left behind.
    expect(outbox.getState()).toMatchObject({ failures: 0, nextAttemptAt: null });

    // Parked: never sent automatically; the status the UI reads says so.
    send.mockClear();
    expect(await outbox.flush({ force: true })).toMatchObject({ reason: 'empty' });
    expect(send).not.toHaveBeenCalled();
    const status = selectOutboxStatus(outbox.getState(), OWNER, false);
    expect(status).toMatchObject({ pending: 0 });
    expect(status.parked).toHaveLength(1);
  });

  it('Retry gives a parked item a fresh set of rounds', async () => {
    const { outbox } = setup();
    const bad = makeDoc(1);
    outbox.configure({ send: pickySend(bad.id) });
    outbox.enqueue(bad);
    outbox.enqueue(makeDoc(2));
    for (let i = 0; i < 3; i++) await outbox.flush({ force: true });
    expect(outbox.getState().entries[0]?.parkedReason).toBeDefined();

    outbox.configure({ send: acking('applied') });
    await outbox.retryParked(bad.id);
    expect(ids(outbox)).toEqual([]);
  });

  it('does not park anything while the whole server is down (no item got through)', async () => {
    const { outbox } = setup();
    outbox.configure({
      send: jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>(() => Promise.reject(serverDown())),
    });
    outbox.enqueue(makeDoc(1));
    outbox.enqueue(makeDoc(2));
    for (let i = 0; i < 5; i++) await outbox.flush({ force: true });

    expect(outbox.getState().entries).toHaveLength(2);
    expect(outbox.getState().entries.every((e) => !e.parkedReason)).toBe(true);
    expect(outbox.getState().lastError).toBe('boom');
  });

  it('network errors never count toward parking', async () => {
    const { outbox } = setup();
    outbox.configure({
      send: jest.fn<ReturnType<SendDocs>, Parameters<SendDocs>>(() =>
        Promise.reject(new TypeError('Network request failed')),
      ),
    });
    outbox.enqueue(makeDoc(1));
    outbox.enqueue(makeDoc(2));
    for (let i = 0; i < 6; i++) await outbox.flush({ force: true });

    expect(outbox.getState().entries.every((e) => !e.parkedReason)).toBe(true);
    expect(outbox.getState().entries.every((e) => e.serverFailures === undefined)).toBe(true);
  });
});
