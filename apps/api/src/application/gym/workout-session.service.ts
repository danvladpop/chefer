import { TRPCError } from '@trpc/server';
import {
  exerciseRepository,
  Prisma,
  routineRepository,
  workoutSessionRepository,
  type IExerciseRepository,
  type IRoutineRepository,
  type IWorkoutSessionRepository,
  type SessionDocWriteData,
  type StoredSessionSnapshot,
} from '@chefer/database';
import type {
  RoutineDto,
  SessionSummaryDto,
  SyncResultDto,
  UpsertSessionsResultDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { nextDayIdAfter, toSessionSummary } from '@chefer/utils';
import { toJson, toRoutineDto, toSessionDoc } from './mappers.js';
import { progressionService, type ProgressionService } from './progression.service.js';

// ─── WorkoutSessionService (gym_plan.md §4.1 / §5.2) ─────────────────────────
// upsertMany is THE offline sync endpoint. It is idempotent and never throws
// for one bad document — every doc gets its own result:
//
//   applied   written, or an identical re-send (same clientUpdatedAt) — the
//             phone removes the outbox entry
//   stale     the server holds a newer clientUpdatedAt; nothing written — the
//             phone also removes the entry (the newer copy wins)
//   rejected  permanently invalid (foreign id, unknown exercise, id clash) —
//             the phone parks the entry as "needs attention"
//
// Unexpected write failures (database down, engine bug) DO throw: the phone
// retries the whole batch later, which is safe because every write is
// idempotent. A failed progression recompute after the writes is logged, not
// thrown (the writes already landed; progression is a derived cache).
//
// After the writes, progressions are recomputed once for every exercise the
// batch touched (current and previous version of each COMPLETED doc).

type RoutineCache = Map<string, RoutineDto | null>;

export class WorkoutSessionService {
  constructor(
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly routineRepo: IRoutineRepository = routineRepository,
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly progression: Pick<ProgressionService, 'recompute'> = progressionService,
  ) {}

  async upsertMany(userId: string, docs: WorkoutSessionDoc[]): Promise<UpsertSessionsResultDto> {
    const results = new Map<number, SyncResultDto>();
    const touched = new Set<string>();

    // Exercise ids must be curated or the caller's own custom (archived ok).
    const allExerciseIds = [...new Set(docs.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
    const visible = new Set(
      (await this.exerciseRepo.findVisibleByIds(userId, allExerciseIds)).map((e) => e.id),
    );
    const routines: RoutineCache = new Map();

    // Oldest first, so an offline backlog advances the rotation in the order
    // the workouts happened. Results keep the request order.
    const order = docs
      .map((doc, index) => ({ doc, index }))
      .sort(
        (a, b) => Date.parse(a.doc.startedAt) - Date.parse(b.doc.startedAt) || a.index - b.index,
      );

    for (const { doc, index } of order) {
      const invalid = validateDoc(doc, visible);
      if (invalid) {
        results.set(index, { id: doc.id, status: 'rejected', reason: invalid });
        continue;
      }
      const result = await this.applyOne(userId, doc, routines, touched);
      results.set(index, result);
    }

    if (touched.size > 0) {
      // The writes are committed; progression is a derived cache. A failed
      // recompute must not fail the sync (the phone would retry forever) —
      // the next write touching these exercises re-folds them.
      await this.progression.recompute(userId, [...touched]).catch((err: unknown) => {
        console.error('[gym] progression recompute failed after upsertMany', { userId, err });
      });
    }
    return {
      results: docs.map((doc, i) => results.get(i) ?? { id: doc.id, status: 'rejected' }),
    };
  }

  async get(userId: string, id: string): Promise<WorkoutSessionDoc> {
    const row = await this.sessionRepo.findByIdForUser(userId, id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found.' });
    return toSessionDoc(row);
  }

  /** History, newest first. Cursor is opaque ("<startedAt ISO>|<id>"). */
  async list(
    userId: string,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: SessionSummaryDto[]; nextCursor: string | null }> {
    const rows = await this.sessionRepo.listForUser(userId, {
      cursor: decodeCursor(input.cursor),
      limit: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => toSessionSummary(toSessionDoc(r))),
      nextCursor:
        rows.length > input.limit && last ? `${last.startedAt.toISOString()}|${last.id}` : null,
    };
  }

  /** Abandon a session. The rotation is not rewound (it only moves on completion). */
  async discard(userId: string, id: string): Promise<{ ok: true }> {
    const previous = await this.sessionRepo.discard(userId, id);
    if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found.' });
    await this.recomputeIfCompleted(userId, previous);
    return { ok: true };
  }

  /** Delete a (typically completed) session; its exercises' progressions are re-folded. */
  async delete(userId: string, id: string): Promise<{ ok: true }> {
    const previous = await this.sessionRepo.delete(userId, id);
    if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found.' });
    await this.recomputeIfCompleted(userId, previous);
    return { ok: true };
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private async applyOne(
    userId: string,
    doc: WorkoutSessionDoc,
    routines: RoutineCache,
    touched: Set<string>,
  ): Promise<SyncResultDto> {
    const rotation = await this.rotationFor(userId, doc, routines);
    const write = toWriteData(doc);

    let res;
    try {
      res = await this.writeWithRetry(userId, write, rotation);
    } catch (err) {
      const reason = knownWriteFailure(err);
      if (reason) return { id: doc.id, status: 'rejected', reason };
      throw err;
    }

    switch (res.status) {
      case 'foreign':
        // Never reveal anything about another user's row.
        return { id: doc.id, status: 'rejected', reason: 'forbidden' };
      case 'stale':
        return { id: doc.id, status: 'stale' };
      case 'unchanged':
      case 'written': {
        // Re-sends of a COMPLETED doc recompute too: the previous attempt may
        // have committed but died before its recompute (self-healing).
        if (doc.status === 'COMPLETED') doc.exercises.forEach((e) => touched.add(e.exerciseId));
        if (res.previous?.status === 'COMPLETED')
          res.previous.exerciseIds.forEach((id) => touched.add(id));
        if (res.status === 'written' && rotation && res.rotationAdvanced) {
          // Later docs in this batch must see the moved pointer.
          const cached = routines.get(rotation.routineId);
          if (cached)
            routines.set(rotation.routineId, { ...cached, nextDayId: rotation.nextDayId });
        }
        return { id: doc.id, status: 'applied' };
      }
    }
  }

  /** A concurrent first insert of the same id can race into P2002 once — retry it. */
  private async writeWithRetry(
    userId: string,
    write: SessionDocWriteData,
    rotation: { routineId: string; nextDayId: string | null } | null,
  ) {
    try {
      return await this.sessionRepo.upsertDocument(userId, write, { rotation });
    } catch (err) {
      if (!isPrismaCode(err, 'P2002')) throw err;
      return this.sessionRepo.upsertDocument(userId, write, { rotation });
    }
  }

  /**
   * The pointer a COMPLETED routine session moves the rotation to (engine
   * nextDayIdAfter). The repository applies it only on the FIRST write that
   * sees the session completed (rotationAppliedAt), so re-syncs are no-ops.
   */
  private async rotationFor(
    userId: string,
    doc: WorkoutSessionDoc,
    routines: RoutineCache,
  ): Promise<{ routineId: string; nextDayId: string | null } | null> {
    if (doc.status !== 'COMPLETED' || !doc.routineId || !doc.routineDayId) return null;
    if (!routines.has(doc.routineId)) {
      const row = await this.routineRepo.findByIdForUser(userId, doc.routineId);
      routines.set(doc.routineId, row ? toRoutineDto(row) : null);
    }
    const routine = routines.get(doc.routineId);
    if (!routine?.days.some((d) => d.id === doc.routineDayId)) return null;
    return { routineId: routine.id, nextDayId: nextDayIdAfter(routine, doc.routineDayId) };
  }

  private async recomputeIfCompleted(userId: string, previous: StoredSessionSnapshot) {
    if (previous.status === 'COMPLETED' && previous.exerciseIds.length > 0) {
      // Same rule as upsertMany: the delete/discard committed; don't fail it.
      await this.progression.recompute(userId, previous.exerciseIds).catch((err: unknown) => {
        console.error('[gym] progression recompute failed after delete/discard', { userId, err });
      });
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Reason string when a doc can never be applied (beyond the Zod input schema). */
export function validateDoc(
  doc: WorkoutSessionDoc,
  visibleExerciseIds: Set<string>,
): string | null {
  const unknown = doc.exercises.find((e) => !visibleExerciseIds.has(e.exerciseId));
  if (unknown) return `unknown_exercise:${unknown.exerciseId}`;
  const ids = [doc.id, ...doc.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)])];
  if (new Set(ids).size !== ids.length) return 'duplicate_ids';
  if (doc.exercises.some((e) => e.repMin > e.repMax)) return 'invalid_rep_range';
  if (doc.finishedAt && Date.parse(doc.finishedAt) < Date.parse(doc.startedAt)) {
    return 'finished_before_started';
  }
  return null;
}

function toWriteData(doc: WorkoutSessionDoc): SessionDocWriteData {
  return {
    id: doc.id,
    routineId: doc.routineId,
    routineDayId: doc.routineDayId,
    name: doc.name,
    status: doc.status,
    startedAt: new Date(doc.startedAt),
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt) : null,
    localDate: doc.localDate,
    isDeload: doc.isDeload,
    notes: doc.notes,
    clientUpdatedAt: new Date(doc.clientUpdatedAt),
    engineVersion: doc.engineVersion,
    exercises: doc.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      routineExerciseId: e.routineExerciseId,
      position: e.position,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      skipped: e.skipped,
      swappedFromId: e.swappedFromId,
      lastSetRir: e.lastSetRir,
      prescription: toJson(e.prescription),
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        position: s.position,
        weightKg: Math.round(s.weightKg * 100) / 100,
        reps: s.reps,
        isWarmup: s.isWarmup,
        completedAt: s.completedAt ? new Date(s.completedAt) : null,
      })),
    })),
  };
}

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/** Constraint failures that retrying can't fix → a per-doc 'rejected'. */
function knownWriteFailure(err: unknown): string | null {
  // P2002: a child id already used by another session; P2003: FK (an exercise
  // vanished between validation and write).
  if (isPrismaCode(err, 'P2002')) return 'id_conflict';
  if (isPrismaCode(err, 'P2003')) return 'invalid_reference';
  return null;
}

function decodeCursor(cursor: string | undefined): { startedAt: Date; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.lastIndexOf('|');
  const startedAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (sep <= 0 || !id || Number.isNaN(startedAt.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor.' });
  }
  return { startedAt, id };
}

export const workoutSessionService = new WorkoutSessionService();
