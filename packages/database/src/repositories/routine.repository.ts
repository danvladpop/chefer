import type { Prisma, Routine, RoutineDay, RoutineExercise } from '@prisma/client';
import { prisma } from '../client';

// ─── Gym routines (gym_plan.md §2.2 / §4.1) ──────────────────────────────────
// A routine is edited as ONE document: saves are full replaces guarded by an
// optimistic `version`. The rotation pointer (nextDayId) is NOT document
// content — moving it never bumps `version`, so finishing a workout can't make
// an open routine editor conflict.

export type RoutineDayWithExercises = RoutineDay & { exercises: RoutineExercise[] };
export type RoutineWithDays = Routine & { days: RoutineDayWithExercises[] };

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
}

export interface RoutineListRow extends Routine {
  _count: { days: number };
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
  ): Promise<ReplaceRoutineResult>;
  setActive(userId: string, id: string): Promise<RoutineWithDays | null>;
  archive(userId: string, id: string): Promise<boolean>;
  setNextDay(userId: string, id: string, dayId: string): Promise<RoutineWithDays | null>;
}

const withDays = {
  days: {
    orderBy: { position: 'asc' },
    include: { exercises: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.RoutineInclude;

function dayCreateInput(day: RoutineDayWriteData, position: number) {
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
      days: { create: data.days.map((d, i) => dayCreateInput(d, i)) },
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
  ): Promise<ReplaceRoutineResult> {
    return prisma.$transaction(async (tx) => {
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

      await tx.routineExercise.deleteMany({
        where: { day: { routineId: id }, id: { notIn: [...keptExerciseIds] } },
      });
      await tx.routineDay.deleteMany({ where: { routineId: id, id: { notIn: [...keptDayIds] } } });

      // A duplicated id in the doc keeps the row once; later copies become new rows.
      const claimed = new Set<string>();
      const claim = (rowId: string | undefined, kept: Set<string>): rowId is string => {
        if (!rowId || !kept.has(rowId) || claimed.has(rowId)) return false;
        claimed.add(rowId);
        return true;
      };

      for (const [position, day] of doc.days.entries()) {
        let dayId: string;
        if (claim(day.id, keptDayIds)) {
          dayId = day.id;
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
        for (const [i, e] of day.exercises.entries()) {
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
            notes: e.notes,
          };
          if (claim(e.id, keptExerciseIds)) {
            await tx.routineExercise.update({ where: { id: e.id }, data });
          } else {
            await tx.routineExercise.create({ data });
          }
        }
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

  async setNextDay(userId: string, id: string, dayId: string): Promise<RoutineWithDays | null> {
    const res = await prisma.routine.updateMany({
      where: { id, userId, days: { some: { id: dayId } } },
      data: { nextDayId: dayId },
    });
    if (res.count === 0) return null;
    return this.findByIdForUser(userId, id);
  }
}

export const routineRepository = new RoutineRepository();
