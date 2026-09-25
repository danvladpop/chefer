import type {
  Prisma,
  SessionExercise,
  SessionSet,
  WorkoutSession,
  WorkoutStatus,
} from '@prisma/client';
import { prisma } from '../client';

// ─── Workout sessions (gym_plan.md §2.2 / §4.1 / §5.2) ───────────────────────
// Sessions are created OFFLINE on the phone with client UUIDs and synced as
// whole documents. The upsert is idempotent: ownership check, last-write-wins
// on clientUpdatedAt, then "upsert the row, delete + recreate the children"
// in one transaction. Every query is scoped by userId.

export type SessionExerciseWithSets = SessionExercise & { sets: SessionSet[] };
export type SessionWithChildren = WorkoutSession & { exercises: SessionExerciseWithSets[] };

export interface SessionSetWriteData {
  id: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  completedAt: Date | null;
}

export interface SessionExerciseWriteData {
  id: string;
  exerciseId: string;
  routineExerciseId: string | null;
  position: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  skipped: boolean;
  swappedFromId: string | null;
  lastSetRir: number | null;
  prescription: Prisma.InputJsonValue;
  notes: string | null;
  sets: SessionSetWriteData[];
}

export interface SessionDocWriteData {
  id: string;
  routineId: string | null;
  routineDayId: string | null;
  name: string;
  status: WorkoutStatus;
  startedAt: Date;
  finishedAt: Date | null;
  localDate: string;
  isDeload: boolean;
  notes: string | null;
  clientUpdatedAt: Date;
  engineVersion: number;
  exercises: SessionExerciseWriteData[];
}

/** What the stored version looked like before a write (drives progression recompute). */
export interface StoredSessionSnapshot {
  status: WorkoutStatus;
  exerciseIds: string[];
}

export type UpsertSessionResult =
  | { status: 'foreign' }
  | { status: 'stale' }
  /** Same clientUpdatedAt as stored — an idempotent re-send; nothing written. */
  | { status: 'unchanged'; previous: StoredSessionSnapshot }
  | { status: 'written'; previous: StoredSessionSnapshot | null; rotationAdvanced: boolean };

export interface UpsertSessionOptions {
  /**
   * Rotation pointer to set when this write is the first to see the session
   * COMPLETED (tracked by WorkoutSession.rotationAppliedAt, so re-syncs of
   * the same session never advance the routine twice).
   */
  rotation: { routineId: string; nextDayId: string | null } | null;
}

export interface SessionCursor {
  startedAt: Date;
  id: string;
}

export interface IWorkoutSessionRepository {
  upsertDocument(
    userId: string,
    doc: SessionDocWriteData,
    opts: UpsertSessionOptions,
  ): Promise<UpsertSessionResult>;
  findByIdForUser(userId: string, id: string): Promise<SessionWithChildren | null>;
  /** Newest first, DISCARDED excluded; cursor = last item of the previous page. */
  listForUser(
    userId: string,
    opts: { cursor: SessionCursor | null; limit: number },
  ): Promise<SessionWithChildren[]>;
  /**
   * COMPLETED sessions ordered by startedAt ASC. With `exerciseIds`, only
   * sessions containing one of them, and only those exercises are included.
   */
  findCompleted(
    userId: string,
    opts?: { exerciseIds?: string[]; fromLocalDate?: string; toLocalDate?: string },
  ): Promise<SessionWithChildren[]>;
  /** localDate of every COMPLETED session (weeks/streak input), ascending. */
  findCompletedDates(userId: string): Promise<string[]>;
  /** Marks a session DISCARDED; returns what it was, or null when not the caller's. */
  discard(userId: string, id: string): Promise<StoredSessionSnapshot | null>;
  delete(userId: string, id: string): Promise<StoredSessionSnapshot | null>;
}

const withChildren = {
  exercises: {
    orderBy: { position: 'asc' },
    include: { sets: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.WorkoutSessionInclude;

async function snapshot(
  tx: Prisma.TransactionClient,
  id: string,
  status: WorkoutStatus,
): Promise<StoredSessionSnapshot> {
  const rows = await tx.sessionExercise.findMany({
    where: { sessionId: id },
    select: { exerciseId: true },
  });
  return { status, exerciseIds: [...new Set(rows.map((r) => r.exerciseId))] };
}

export class WorkoutSessionRepository implements IWorkoutSessionRepository {
  async upsertDocument(
    userId: string,
    doc: SessionDocWriteData,
    opts: UpsertSessionOptions,
  ): Promise<UpsertSessionResult> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({
        where: { id: doc.id },
        select: { userId: true, clientUpdatedAt: true, status: true },
      });
      if (existing && existing.userId !== userId) return { status: 'foreign' };
      if (existing && existing.clientUpdatedAt.getTime() > doc.clientUpdatedAt.getTime()) {
        return { status: 'stale' };
      }
      const previous = existing ? await snapshot(tx, doc.id, existing.status) : null;
      if (
        existing &&
        previous &&
        existing.clientUpdatedAt.getTime() === doc.clientUpdatedAt.getTime()
      ) {
        return { status: 'unchanged', previous };
      }

      const row = {
        routineId: doc.routineId,
        routineDayId: doc.routineDayId,
        name: doc.name,
        status: doc.status,
        startedAt: doc.startedAt,
        finishedAt: doc.finishedAt,
        localDate: doc.localDate,
        isDeload: doc.isDeload,
        notes: doc.notes,
        clientUpdatedAt: doc.clientUpdatedAt,
        engineVersion: doc.engineVersion,
      };
      await tx.workoutSession.upsert({
        where: { id: doc.id },
        create: { id: doc.id, userId, ...row },
        update: row,
      });

      // Children: delete + recreate (sets cascade with their exercise).
      await tx.sessionExercise.deleteMany({ where: { sessionId: doc.id } });
      if (doc.exercises.length > 0) {
        await tx.sessionExercise.createMany({
          data: doc.exercises.map((e) => ({
            id: e.id,
            sessionId: doc.id,
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
            prescription: e.prescription,
            notes: e.notes,
          })),
        });
        const sets = doc.exercises.flatMap((e) =>
          e.sets.map((s) => ({ ...s, sessionExerciseId: e.id })),
        );
        if (sets.length > 0) await tx.sessionSet.createMany({ data: sets });
      }

      let rotationAdvanced = false;
      if (doc.status === 'COMPLETED' && opts.rotation) {
        // Conditional claim: only the first write that sees COMPLETED advances.
        const claimed = await tx.workoutSession.updateMany({
          where: { id: doc.id, rotationAppliedAt: null },
          data: { rotationAppliedAt: new Date() },
        });
        if (claimed.count === 1) {
          await tx.routine.updateMany({
            where: { id: opts.rotation.routineId, userId },
            data: { nextDayId: opts.rotation.nextDayId },
          });
          rotationAdvanced = true;
        }
      }
      return { status: 'written', previous, rotationAdvanced };
    });
  }

  async findByIdForUser(userId: string, id: string): Promise<SessionWithChildren | null> {
    return prisma.workoutSession.findFirst({ where: { id, userId }, include: withChildren });
  }

  async listForUser(
    userId: string,
    opts: { cursor: SessionCursor | null; limit: number },
  ): Promise<SessionWithChildren[]> {
    const { cursor } = opts;
    return prisma.workoutSession.findMany({
      where: {
        userId,
        status: { not: 'DISCARDED' },
        ...(cursor && {
          OR: [
            { startedAt: { lt: cursor.startedAt } },
            { startedAt: cursor.startedAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: opts.limit,
      include: withChildren,
    });
  }

  async findCompleted(
    userId: string,
    opts: { exerciseIds?: string[]; fromLocalDate?: string; toLocalDate?: string } = {},
  ): Promise<SessionWithChildren[]> {
    const { exerciseIds, fromLocalDate, toLocalDate } = opts;
    if (exerciseIds?.length === 0) return [];
    const localDate =
      fromLocalDate || toLocalDate
        ? {
            ...(fromLocalDate && { gte: fromLocalDate }),
            ...(toLocalDate && { lte: toLocalDate }),
          }
        : undefined;
    return prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        ...(localDate && { localDate }),
        ...(exerciseIds && { exercises: { some: { exerciseId: { in: exerciseIds } } } }),
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      include: {
        exercises: {
          ...(exerciseIds && { where: { exerciseId: { in: exerciseIds } } }),
          orderBy: { position: 'asc' },
          include: { sets: { orderBy: { position: 'asc' } } },
        },
      },
    });
  }

  async findCompletedDates(userId: string): Promise<string[]> {
    const rows = await prisma.workoutSession.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { localDate: true },
      orderBy: { localDate: 'asc' },
    });
    return rows.map((r) => r.localDate);
  }

  async discard(userId: string, id: string): Promise<StoredSessionSnapshot | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!existing) return null;
      const previous = await snapshot(tx, id, existing.status);
      // Bump clientUpdatedAt so an older copy still sitting in a phone's
      // outbox can't resurrect the session (last write wins).
      await tx.workoutSession.update({
        where: { id },
        data: { status: 'DISCARDED', clientUpdatedAt: new Date() },
      });
      return previous;
    });
  }

  async delete(userId: string, id: string): Promise<StoredSessionSnapshot | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!existing) return null;
      const previous = await snapshot(tx, id, existing.status);
      await tx.workoutSession.delete({ where: { id } });
      return previous;
    });
  }
}

export const workoutSessionRepository = new WorkoutSessionRepository();
