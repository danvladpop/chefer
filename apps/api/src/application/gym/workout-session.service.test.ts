import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Prisma,
  type IExerciseRepository,
  type IRoutineRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import { nextDayIdAfter, toSessionSummary } from '@chefer/utils';
import {
  exerciseRow,
  makeMemorySessionRepo,
  routineRow,
  sessionDoc,
  sessionRow,
} from './__test__/fixtures.js';
import { WorkoutSessionService } from './workout-session.service.js';

// The engine is implemented in parallel (G1-A); stub the functions this
// service calls so the tests pin the SERVICE behaviour only.
vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  nextDayIdAfter: vi.fn(),
  toSessionSummary: vi.fn(),
}));

const USER = 'u1';

function makeExerciseRepo(ids = ['bench', 'squat']): IExerciseRepository {
  return {
    findVisibleByIds: vi.fn((_u: string, wanted: string[]) =>
      Promise.resolve(ids.filter((id) => wanted.includes(id)).map((id) => exerciseRow(id))),
    ),
  } as unknown as IExerciseRepository;
}

function makeRoutineRepo(): IRoutineRepository {
  return {
    findByIdForUser: vi.fn((_u: string, id: string) =>
      Promise.resolve(id === 'r1' ? routineRow() : null),
    ),
  } as unknown as IRoutineRepository;
}

function setup(sessionRepo?: IWorkoutSessionRepository) {
  const memory = makeMemorySessionRepo(new Map([['r1', 'day-a']]));
  const progression = { recompute: vi.fn().mockResolvedValue(undefined) };
  const routineRepo = makeRoutineRepo();
  const service = new WorkoutSessionService(
    sessionRepo ?? memory.repo,
    routineRepo,
    makeExerciseRepo(),
    progression,
  );
  return { service, memory, progression, routineRepo };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Engine stand-in: two-day rotation a → b → a.
  vi.mocked(nextDayIdAfter).mockImplementation((_routine, dayId) =>
    dayId === 'day-a' ? 'day-b' : 'day-a',
  );
});

describe('WorkoutSessionService.upsertMany', () => {
  it('is idempotent: the same doc twice → one write, applied both times', async () => {
    const { service, memory, progression } = setup();
    const doc = sessionDoc();

    const first = await service.upsertMany(USER, [doc]);
    const second = await service.upsertMany(USER, [doc]);

    expect(first.results).toEqual([{ id: doc.id, status: 'applied' }]);
    expect(second.results).toEqual([{ id: doc.id, status: 'applied' }]);
    expect(memory.writes).toHaveLength(1);
    expect(memory.rows.size).toBe(1);
    // A re-send still recomputes (self-healing if the first recompute died).
    expect(progression.recompute).toHaveBeenCalledTimes(2);
    expect(progression.recompute).toHaveBeenLastCalledWith(USER, ['bench']);
  });

  it('ignores an older clientUpdatedAt as stale without writing', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc({ clientUpdatedAt: '2026-09-02T18:05:00.000Z' });
    await service.upsertMany(USER, [doc]);

    const older = { ...doc, notes: 'old copy', clientUpdatedAt: '2026-09-02T18:00:00.000Z' };
    const res = await service.upsertMany(USER, [older]);

    expect(res.results).toEqual([{ id: doc.id, status: 'stale' }]);
    expect(memory.writes).toHaveLength(1);
    expect(memory.rows.get(doc.id)?.doc.notes).toBeNull();
  });

  it('applies a newer clientUpdatedAt (last write wins)', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc();
    await service.upsertMany(USER, [doc]);
    const edited = { ...doc, notes: 'felt strong', clientUpdatedAt: '2026-09-02T19:00:00.000Z' };

    const res = await service.upsertMany(USER, [edited]);

    expect(res.results[0]?.status).toBe('applied');
    expect(memory.rows.get(doc.id)?.doc.notes).toBe('felt strong');
  });

  it('rejects a session id owned by another user and reveals nothing', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc();
    await service.upsertMany('someone-else', [doc]);

    const res = await service.upsertMany(USER, [
      { ...doc, clientUpdatedAt: '2027-01-01T00:00:00.000Z' },
    ]);

    expect(res.results).toEqual([{ id: doc.id, status: 'rejected', reason: 'forbidden' }]);
    expect(memory.rows.get(doc.id)?.userId).toBe('someone-else');
  });

  it('rejects unknown exercise ids per doc and still applies the rest of the batch', async () => {
    const { service } = setup();
    const good = sessionDoc();
    const bad = sessionDoc();
    bad.exercises[0]!.exerciseId = 'not-a-real-exercise';

    const res = await service.upsertMany(USER, [bad, good]);

    expect(res.results).toEqual([
      { id: bad.id, status: 'rejected', reason: 'unknown_exercise:not-a-real-exercise' },
      { id: good.id, status: 'applied' },
    ]);
  });

  it('rejects duplicate child ids inside a doc', async () => {
    const { service } = setup();
    const doc = sessionDoc();
    doc.exercises[0]!.sets[0]!.id = doc.exercises[0]!.id;

    const res = await service.upsertMany(USER, [doc]);

    expect(res.results[0]).toEqual({ id: doc.id, status: 'rejected', reason: 'duplicate_ids' });
  });

  it('advances the rotation exactly once across re-syncs and later edits', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc({ routineDayId: 'day-a' });

    await service.upsertMany(USER, [doc]);
    expect(memory.routinePointers.get('r1')).toBe('day-b');

    // User moves the pointer back by hand, then the phone re-syncs and edits.
    memory.routinePointers.set('r1', 'day-a');
    await service.upsertMany(USER, [doc]);
    await service.upsertMany(USER, [
      { ...doc, notes: 'edit', clientUpdatedAt: '2026-09-03T08:00:00.000Z' },
    ]);

    expect(memory.routinePointers.get('r1')).toBe('day-a');
  });

  it('does not advance the rotation for IN_PROGRESS checkpoints, then advances on completion', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc({
      status: 'IN_PROGRESS',
      finishedAt: null,
      clientUpdatedAt: '2026-09-02T17:30:00.000Z',
    });

    await service.upsertMany(USER, [doc]);
    expect(memory.routinePointers.get('r1')).toBe('day-a');

    await service.upsertMany(USER, [
      {
        ...doc,
        status: 'COMPLETED',
        finishedAt: '2026-09-02T18:00:00.000Z',
        clientUpdatedAt: '2026-09-02T18:00:00.000Z',
      },
    ]);
    expect(memory.routinePointers.get('r1')).toBe('day-b');
  });

  it('applies an offline backlog oldest-first so the rotation follows the real order', async () => {
    const { service, memory } = setup();
    const monday = sessionDoc({
      routineDayId: 'day-a',
      startedAt: '2026-09-07T17:00:00.000Z',
      finishedAt: '2026-09-07T18:00:00.000Z',
    });
    const thursday = sessionDoc({
      routineDayId: 'day-b',
      startedAt: '2026-09-10T17:00:00.000Z',
      finishedAt: '2026-09-10T18:00:00.000Z',
    });

    // Sent newest-first; results keep request order.
    const res = await service.upsertMany(USER, [thursday, monday]);

    expect(res.results.map((r) => r.id)).toEqual([thursday.id, monday.id]);
    expect(vi.mocked(nextDayIdAfter).mock.calls.map((c) => c[1])).toEqual(['day-a', 'day-b']);
    expect(memory.routinePointers.get('r1')).toBe('day-a');
  });

  it('skips rotation when the routine day is not part of the (owned) routine', async () => {
    const { service, memory } = setup();
    await service.upsertMany(USER, [sessionDoc({ routineId: 'r-foreign', routineDayId: 'x' })]);
    await service.upsertMany(USER, [sessionDoc({ routineDayId: 'day-zzz' })]);

    expect(nextDayIdAfter).not.toHaveBeenCalled();
    expect(memory.routinePointers.get('r1')).toBe('day-a');
  });

  it('recomputes the exercises a completed doc used to contain when it changes', async () => {
    const { service, progression } = setup();
    const doc = sessionDoc();
    await service.upsertMany(USER, [doc]);
    const swapped = {
      ...doc,
      clientUpdatedAt: '2026-09-02T19:00:00.000Z',
      exercises: [{ ...doc.exercises[0]!, exerciseId: 'squat' }],
    };

    await service.upsertMany(USER, [swapped]);

    expect(progression.recompute).toHaveBeenLastCalledWith(
      USER,
      expect.arrayContaining(['bench', 'squat']),
    );
  });

  it('does not recompute for an IN_PROGRESS checkpoint', async () => {
    const { service, progression } = setup();
    await service.upsertMany(USER, [sessionDoc({ status: 'IN_PROGRESS', finishedAt: null })]);
    expect(progression.recompute).not.toHaveBeenCalled();
  });

  it('still acks the writes when the progression recompute fails', async () => {
    const { service, progression } = setup();
    progression.recompute.mockRejectedValueOnce(new Error('engine exploded'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await service.upsertMany(USER, [sessionDoc()]);

    expect(res.results[0]?.status).toBe('applied');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('maps a child-id unique clash (P2002) to rejected id_conflict after one retry', async () => {
    const clash = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const repo = makeMemorySessionRepo().repo;
    vi.mocked(repo.upsertDocument).mockRejectedValue(clash);
    const { service } = setup(repo);
    const doc = sessionDoc();

    const res = await service.upsertMany(USER, [doc]);

    expect(res.results).toEqual([{ id: doc.id, status: 'rejected', reason: 'id_conflict' }]);
    expect(repo.upsertDocument).toHaveBeenCalledTimes(2);
  });

  it('throws on unexpected write failures so the phone retries the batch', async () => {
    const repo = makeMemorySessionRepo().repo;
    vi.mocked(repo.upsertDocument).mockRejectedValue(new Error('db down'));
    const { service } = setup(repo);

    await expect(service.upsertMany(USER, [sessionDoc()])).rejects.toThrow('db down');
  });

  it('rounds set weights to 0.01 kg on the way in', async () => {
    const { service, memory } = setup();
    const doc = sessionDoc();
    doc.exercises[0]!.sets[0]!.weightKg = 61.23456;

    await service.upsertMany(USER, [doc]);

    expect(memory.writes[0]?.exercises[0]?.sets[0]?.weightKg).toBe(61.23);
  });
});

describe('WorkoutSessionService delete / discard / get / list', () => {
  it('delete of a completed session triggers a recompute of its exercises', async () => {
    const { service, progression } = setup();
    const doc = sessionDoc();
    await service.upsertMany(USER, [doc]);
    progression.recompute.mockClear();

    await expect(service.delete(USER, doc.id)).resolves.toEqual({ ok: true });

    expect(progression.recompute).toHaveBeenCalledWith(USER, ['bench']);
  });

  it("delete of someone else's session is NOT_FOUND", async () => {
    const { service } = setup();
    const doc = sessionDoc();
    await service.upsertMany('other', [doc]);

    await expect(service.delete(USER, doc.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('discarding an in-progress session does not recompute', async () => {
    const { service, progression } = setup();
    const doc = sessionDoc({ status: 'IN_PROGRESS', finishedAt: null });
    await service.upsertMany(USER, [doc]);

    await service.discard(USER, doc.id);

    expect(progression.recompute).not.toHaveBeenCalled();
  });

  it('get maps stored rows back to the uploaded doc shape', async () => {
    const doc = sessionDoc();
    const repo = makeMemorySessionRepo().repo;
    vi.mocked(repo.findByIdForUser).mockResolvedValue(sessionRow(doc));
    const { service } = setup(repo);

    await expect(service.get(USER, doc.id)).resolves.toEqual(doc);
  });

  it('list pages newest-first with an opaque startedAt|id cursor', async () => {
    const docs = [
      sessionDoc({ startedAt: '2026-09-03T17:00:00.000Z' }),
      sessionDoc({ startedAt: '2026-09-02T17:00:00.000Z' }),
      sessionDoc({ startedAt: '2026-09-01T17:00:00.000Z' }),
    ];
    const repo = makeMemorySessionRepo().repo;
    vi.mocked(repo.listForUser).mockResolvedValue(docs.map((d) => sessionRow(d)));
    vi.mocked(toSessionSummary).mockImplementation((d) => ({ id: d.id }) as never);
    const { service } = setup(repo);

    const page = await service.list(USER, { limit: 2 });

    expect(repo.listForUser).toHaveBeenCalledWith(USER, { cursor: null, limit: 3 });
    expect(page.items.map((i) => i.id)).toEqual([docs[0]!.id, docs[1]!.id]);
    expect(page.nextCursor).toBe(`2026-09-02T17:00:00.000Z|${docs[1]!.id}`);

    await service.list(USER, { limit: 2, cursor: page.nextCursor ?? undefined });
    expect(repo.listForUser).toHaveBeenLastCalledWith(USER, {
      cursor: { startedAt: new Date('2026-09-02T17:00:00.000Z'), id: docs[1]!.id },
      limit: 3,
    });
  });

  it('list rejects a malformed cursor', async () => {
    const { service } = setup();
    await expect(service.list(USER, { limit: 5, cursor: 'garbage' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
