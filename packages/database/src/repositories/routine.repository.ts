import type { Exercise, Prisma, Routine, RoutineDay, RoutineExercise } from '@prisma/client';
import { prisma } from '../client';

// ─── Gym routines (gym_plan.md §2.2 / §4.1) ──────────────────────────────────
// A routine is edited as ONE document: saves are full replaces guarded by an
// optimistic `version`. The rotation pointer (nextDayId) is NOT document
// content — moving it never bumps `version`, so finishing a workout can't make
// an open routine editor conflict.

export type RoutineDayWithExercises = RoutineDay & { exercises: RoutineExercise[] };
export type RoutineWithDays = Routine & { days: RoutineDayWithExercises[] };

/** The exercise columns another user's routine view may read (Following, plan §5). */
export type RoutineExerciseMeta = Pick<Exercise, 'id' | 'name' | 'ownerId' | 'trackingType'>;
export type RoutineWithExerciseMeta = Routine & {
  days: (RoutineDay & { exercises: (RoutineExercise & { exercise: RoutineExerciseMeta })[] })[];
};

export interface RoutineExerciseWriteData {
  /** Existing id to keep (ignored unless it already belongs to this routine). */
  id?: string | undefined;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  notes: string | null;
  /**
   * Trainer coaching: written ONLY on the TRAINER path (`ReplaceDocumentActor.path`).
   * On the OWNER path it is ignored: a save from any client version keeps the
   * stored trainer note (or clears it via `clearTrainerNoteIds`).
   */
  trainerNote?: string | null | undefined;
}

export interface RoutineDayWriteData {
  id?: string | undefined;
  name: string;
  plannedWeekday: number | null;
  exercises: RoutineExerciseWriteData[];
}

export interface RoutineCreateData {
  name: string;
  templateKey: string | null;
  isActive: boolean;
  days: RoutineDayWriteData[];
  /** Trainer coaching: the routine and every row are stamped as created by this user (a trainer creating a client's first routine). */
  editedBy?: { id: string; at: Date } | undefined;
}

export interface RoutineListRow extends Routine {
  _count: { days: number };
}

// ─── Edit attribution (trainer coaching, spec §5.3) ───────────────────────────
// `replaceDocument` stamps WHO changed WHAT: `lastEditedById` / `lastEditedAt` on
// each row the save changed and on the routine when anything changed. The diff is
// injected (`ReplaceDocumentActor.diff`, `diffRoutineDoc` from @chefer/utils: this
// package cannot import it) and runs INSIDE the version-checked transaction.

/** Structural twin of @chefer/utils `DiffDoc` (kept here so the repository has no dependency on it). */
export interface StampDoc {
  name: string;
  days: {
    id?: string | undefined;
    name: string;
    plannedWeekday: number | null;
    exercises: {
      id?: string | undefined;
      exerciseId: string;
      sets: number;
      repMin: number;
      repMax: number;
      targetRir: number;
      restSec: number;
      supersetGroup: string | null;
      trainerNote: string | null;
    }[];
  }[];
}

export interface StampDiff {
  routineChanged: boolean;
  /** `changed[d][e]` for the e-th exercise of the d-th day of `after`. */
  changed: boolean[][];
}

export interface ReplaceDocumentActor {
  /** Who is saving: the owner, or the trainer. */
  actorId: string;
  /** OWNER: `trainerNote` is never written (except cleared by `clearTrainerNoteIds`). TRAINER: `notes` is never written. */
  path: 'OWNER' | 'TRAINER';
  /** OWNER path only: routine-exercise ids whose trainer note the client removes with this save. */
  clearTrainerNoteIds?: readonly string[] | undefined;
  /** `diffRoutineDoc`. */
  diff: (before: StampDoc, after: StampDoc) => StampDiff;
}

export type ReplaceRoutineResult =
  | { status: 'ok'; routine: RoutineWithDays }
  | { status: 'not_found' }
  | { status: 'conflict'; current: RoutineWithDays };

export interface IRoutineRepository {
  listForUser(userId: string): Promise<RoutineListRow[]>;
  findByIdForUser(userId: string, id: string): Promise<RoutineWithDays | null>;
  findActive(userId: string): Promise<RoutineWithDays | null>;
  /** Creates the routine (rotation pointer = first day). isActive deactivates the others. */
  create(userId: string, data: RoutineCreateData): Promise<RoutineWithDays>;
  /** Full-document replace when `expectedVersion` matches; bumps the version. */
  replaceDocument(
    userId: string,
    id: string,
    doc: { name: string; days: RoutineDayWriteData[] },
    expectedVersion: number,
    /** Omitted = legacy behaviour: no stamps, `trainerNote` untouched. */
    actor?: ReplaceDocumentActor,
  ): Promise<ReplaceRoutineResult>;
  setActive(userId: string, id: string): Promise<RoutineWithDays | null>;
  archive(userId: string, id: string): Promise<boolean>;
  /** Un-archives (never makes it active). False when the routine is not the user's. */
  restore(userId: string, id: string): Promise<boolean>;
  setNextDay(userId: string, id: string, dayId: string): Promise<RoutineWithDays | null>;
}

const withDays = {
  days: {
    orderBy: { position: 'asc' },
    include: { exercises: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.RoutineInclude;

const withDaysAndExerciseMeta = {
  days: {
    orderBy: { position: 'asc' },
    include: {
      exercises: {
        orderBy: { position: 'asc' },
        include: {
          exercise: { select: { id: true, name: true, ownerId: true, trackingType: true } },
        },
      },
    },
  },
} satisfies Prisma.RoutineInclude;

function dayCreateInput(
  day: RoutineDayWriteData,
  position: number,
  editedBy?: { id: string; at: Date },
) {
  const stamp = editedBy ? { lastEditedById: editedBy.id, lastEditedAt: editedBy.at } : {};
  return {
    position,
    name: day.name,
    plannedWeekday: day.plannedWeekday,
    exercises: {
      create: day.exercises.map((e, i) => ({
        exerciseId: e.exerciseId,
        position: i,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        notes: e.notes,
        ...stamp,
      })),
    },
  } satisfies Prisma.RoutineDayCreateWithoutRoutineInput;
}

/**
 * Transaction-scoped create, shared with GymProfileRepository.completeSetup so
 * setup's profile + routine + progressions land atomically.
 */
export async function createRoutineInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  data: RoutineCreateData,
): Promise<RoutineWithDays> {
  if (data.isActive) {
    await tx.routine.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
  }
  const created = await tx.routine.create({
    data: {
      userId,
      name: data.name,
      templateKey: data.templateKey,
      isActive: data.isActive,
      ...(data.editedBy && { lastEditedById: data.editedBy.id, lastEditedAt: data.editedBy.at }),
      days: { create: data.days.map((d, i) => dayCreateInput(d, i, data.editedBy)) },
    },
    include: withDays,
  });
  const firstDayId = created.days[0]?.id ?? null;
  return tx.routine.update({
    where: { id: created.id },
    data: { nextDayId: firstDayId },
    include: withDays,
  });
}

export class RoutineRepository implements IRoutineRepository {
  async listForUser(userId: string): Promise<RoutineListRow[]> {
    return prisma.routine.findMany({
      where: { userId },
      include: { _count: { select: { days: true } } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findByIdForUser(userId: string, id: string): Promise<RoutineWithDays | null> {
    return prisma.routine.findFirst({ where: { id, userId }, include: withDays });
  }

  async findActive(userId: string): Promise<RoutineWithDays | null> {
    return prisma.routine.findFirst({
      where: { userId, isActive: true, archivedAt: null },
      include: withDays,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, data: RoutineCreateData): Promise<RoutineWithDays> {
    return prisma.$transaction((tx) => createRoutineInTx(tx, userId, data));
  }

  async replaceDocument(
    userId: string,
    id: string,
    doc: { name: string; days: RoutineDayWriteData[] },
    expectedVersion: number,
    actor?: ReplaceDocumentActor,
  ): Promise<ReplaceRoutineResult> {
    return prisma.$transaction(async (tx) => {
      // The stored name, for the attribution diff (the bump below overwrites it).
      // Safe without a lock: the name only changes through a bumped save, so if
      // the bump below matches `expectedVersion`, nothing changed it since.
      const stored = await tx.routine.findFirst({ where: { id, userId }, select: { name: true } });
      // Version check + bump in one statement: the row lock serialises
      // concurrent saves, so exactly one of two racing editors wins.
      const bumped = await tx.routine.updateMany({
        where: { id, userId, version: expectedVersion },
        data: { name: doc.name, version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        const current = await tx.routine.findFirst({ where: { id, userId }, include: withDays });
        return current ? { status: 'conflict', current } : { status: 'not_found' };
      }

      const existing = await tx.routine.findUniqueOrThrow({ where: { id }, include: withDays });
      const existingDayIds = new Set(existing.days.map((d) => d.id));

      // Ids are only kept when they already belong to this routine.
      const keptDayIds = new Set(
        doc.days.map((d) => d.id).filter((d): d is string => !!d && existingDayIds.has(d)),
      );
      // An exercise row survives only if its current day survives too (deleting
      // a day cascades to its rows; moving between kept days is fine).
      const existingExerciseIds = new Set(
        existing.days
          .filter((d) => keptDayIds.has(d.id))
          .flatMap((d) => d.exercises.map((e) => e.id)),
      );
      const keptExerciseIds = new Set(
        doc.days
          .flatMap((d) => d.exercises.map((e) => e.id))
          .filter((e): e is string => !!e && existingExerciseIds.has(e)),
      );

      // A duplicated id in the doc keeps the row once; later copies become new
      // rows. Resolved up front so the diff and the writes agree on which rows
      // are kept.
      const claimed = new Set<string>();
      const claim = (rowId: string | undefined, kept: Set<string>): rowId is string => {
        if (!rowId || !kept.has(rowId) || claimed.has(rowId)) return false;
        claimed.add(rowId);
        return true;
      };
      const plan = doc.days.map((day) => ({
        day,
        keptId: claim(day.id, keptDayIds) ? day.id : undefined,
        rows: [] as { row: RoutineExerciseWriteData; keptId: string | undefined }[],
      }));
      for (const entry of plan) {
        for (const row of entry.day.exercises) {
          entry.rows.push({ row, keptId: claim(row.id, keptExerciseIds) ? row.id : undefined });
        }
      }

      // Edit attribution: diff the stored document against what will be stored.
      const now = new Date();
      const storedRows = new Map(
        existing.days.flatMap((d) => d.exercises.map((e) => [e.id, e] as const)),
      );
      const cleared = new Set(actor?.clearTrainerNoteIds ?? []);
      const trainerNoteOf = (
        row: RoutineExerciseWriteData,
        keptId: string | undefined,
      ): string | null => {
        if (actor?.path === 'TRAINER') return row.trainerNote?.trim() || null;
        // OWNER path (or no actor): the stored note survives, unless the client removed it.
        if (!keptId || cleared.has(keptId)) return null;
        return storedRows.get(keptId)?.trainerNote ?? null;
      };
      let changed: boolean[][] = [];
      let routineChanged = false;
      if (actor) {
        const stampDoc = (days: StampDoc['days'], name: string): StampDoc => ({ name, days });
        const diff = actor.diff(
          stampDoc(
            existing.days.map((d) => ({
              id: d.id,
              name: d.name,
              plannedWeekday: d.plannedWeekday,
              exercises: d.exercises.map((e) => ({ ...e })),
            })),
            stored?.name ?? doc.name,
          ),
          stampDoc(
            plan.map(({ day, keptId, rows }) => ({
              id: keptId,
              name: day.name,
              plannedWeekday: day.plannedWeekday,
              exercises: rows.map(({ row, keptId: rowKept }) => ({
                id: rowKept,
                exerciseId: row.exerciseId,
                sets: row.sets,
                repMin: row.repMin,
                repMax: row.repMax,
                targetRir: row.targetRir,
                restSec: row.restSec,
                supersetGroup: row.supersetGroup,
                trainerNote: trainerNoteOf(row, rowKept),
              })),
            })),
            doc.name,
          ),
        );
        changed = diff.changed;
        routineChanged = diff.routineChanged;
      }

      await tx.routineExercise.deleteMany({
        where: { day: { routineId: id }, id: { notIn: [...keptExerciseIds] } },
      });
      await tx.routineDay.deleteMany({ where: { routineId: id, id: { notIn: [...keptDayIds] } } });

      for (const [position, { day, keptId: keptDayId }] of plan.entries()) {
        let dayId: string;
        if (keptDayId) {
          dayId = keptDayId;
          await tx.routineDay.update({
            where: { id: dayId },
            data: { position, name: day.name, plannedWeekday: day.plannedWeekday },
          });
        } else {
          const created = await tx.routineDay.create({
            data: { routineId: id, position, name: day.name, plannedWeekday: day.plannedWeekday },
          });
          dayId = created.id;
        }
        for (const [i, { row: e, keptId: rowKept }] of (plan[position]?.rows ?? []).entries()) {
          const stamp =
            actor && (changed[position]?.[i] ?? true)
              ? { lastEditedById: actor.actorId, lastEditedAt: now }
              : {};
          const data = {
            dayId,
            exerciseId: e.exerciseId,
            position: i,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            targetRir: e.targetRir,
            restSec: e.restSec,
            supersetGroup: e.supersetGroup,
            ...stamp,
          };
          if (rowKept) {
            await tx.routineExercise.update({
              where: { id: rowKept },
              data: {
                ...data,
                // TRAINER path: the owner's own note is never touched.
                ...(actor?.path !== 'TRAINER' && { notes: e.notes }),
                // The stored trainer note survives an OWNER save; it is only written / cleared deliberately.
                ...(actor && { trainerNote: trainerNoteOf(e, rowKept) }),
              },
            });
          } else {
            await tx.routineExercise.create({
              data: {
                ...data,
                notes: actor?.path === 'TRAINER' ? null : e.notes,
                trainerNote: actor ? trainerNoteOf(e, undefined) : null,
              },
            });
          }
        }
      }

      if (actor && routineChanged) {
        await tx.routine.update({
          where: { id },
          data: { lastEditedById: actor.actorId, lastEditedAt: now },
        });
      }

      const saved = await tx.routine.findUniqueOrThrow({ where: { id }, include: withDays });
      // Keep the rotation pointer valid when its day was removed.
      if (!saved.days.some((d) => d.id === saved.nextDayId)) {
        return {
          status: 'ok',
          routine: await tx.routine.update({
            where: { id },
            data: { nextDayId: saved.days[0]?.id ?? null },
            include: withDays,
          }),
        };
      }
      return { status: 'ok', routine: saved };
    });
  }

  async setActive(userId: string, id: string): Promise<RoutineWithDays | null> {
    return prisma.$transaction(async (tx) => {
      const target = await tx.routine.findFirst({ where: { id, userId } });
      if (!target) return null;
      await tx.routine.updateMany({
        where: { userId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
      return tx.routine.update({
        where: { id },
        data: { isActive: true, archivedAt: null },
        include: withDays,
      });
    });
  }

  async archive(userId: string, id: string): Promise<boolean> {
    const res = await prisma.routine.updateMany({
      where: { id, userId },
      data: { archivedAt: new Date(), isActive: false },
    });
    return res.count > 0;
  }

  async restore(userId: string, id: string): Promise<boolean> {
    const res = await prisma.routine.updateMany({
      where: { id, userId },
      data: { archivedAt: null },
    });
    return res.count > 0;
  }

  async setNextDay(userId: string, id: string, dayId: string): Promise<RoutineWithDays | null> {
    const res = await prisma.routine.updateMany({
      where: { id, userId, days: { some: { id: dayId } } },
      data: { nextDayId: dayId },
    });
    if (res.count === 0) return null;
    return this.findByIdForUser(userId, id);
  }

  /**
   * Following (plan §2.4, §5): the active, unarchived routine (same pick as
   * `findActive`) with days and exercises in order, each exercise joined to
   * `Exercise { id, name, ownerId, trackingType }`. Read-only. Deliberately
   * NOT on `IRoutineRepository`, so the gym services' repository mocks don't
   * have to grow; Following depends on `Pick<RoutineRepository, …>`.
   */
  async findActiveWithExercises(userId: string): Promise<RoutineWithExerciseMeta | null> {
    return prisma.routine.findFirst({
      where: { userId, isActive: true, archivedAt: null },
      include: withDaysAndExerciseMeta,
      orderBy: { updatedAt: 'desc' },
    });
  }
}

export const routineRepository = new RoutineRepository();
