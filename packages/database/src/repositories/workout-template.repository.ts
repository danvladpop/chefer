import type { Prisma, WorkoutTemplate, WorkoutTemplateExercise, WorkoutType } from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer mode: workout templates (docs/prd-2026-10/trainer-mode.md §6.6, §8.1)
// A trainer's reusable workout. Saved as ONE document guarded by an optimistic
// `version` (like routines). Deleting is a soft delete: the row stays 30 days
// (`purgeDeletedBefore`, coaching-maintenance worker) and clients' copies keep
// their `RoutineDay.templateName` either way (no foreign key on the copy).

export type WorkoutTemplateWithExercises = WorkoutTemplate & {
  exercises: WorkoutTemplateExercise[];
};

export interface TemplateExerciseWriteData {
  /** Existing row id to keep (ignored unless it already belongs to this template). */
  id?: string | undefined;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  defaultLoadKg: number | null;
  trainerNote: string | null;
}

export interface TemplateWriteData {
  name: string;
  workoutType: WorkoutType | null;
  exercises: TemplateExerciseWriteData[];
}

export type ReplaceTemplateResult =
  | { status: 'ok'; template: WorkoutTemplateWithExercises }
  | { status: 'not_found' }
  | { status: 'conflict'; current: WorkoutTemplateWithExercises };

/** A routine day copied from a template, in a user's ACTIVE routine. */
export interface TemplateAssignmentRow {
  dayId: string;
  dayName: string;
  routineId: string;
  userId: string;
  templateId: string;
  templateVersion: number;
  templateAssignedAt: Date | null;
  editedSinceTemplate: boolean;
}

/** What a client's copied day shows as "Based on …": the live name, or gone. */
export interface TemplateNameRow {
  id: string;
  trainerId: string;
  name: string;
  deletedAt: Date | null;
}

export interface IWorkoutTemplateRepository {
  /** The trainer's live templates, most recently edited first, with their rows. */
  listForTrainer(trainerId: string): Promise<WorkoutTemplateWithExercises[]>;
  /** One live template of this trainer (another trainer's or a deleted one is null). */
  find(trainerId: string, id: string): Promise<WorkoutTemplateWithExercises | null>;
  /** Names of any templates (deleted included) for "Based on …". Missing (purged) ids are absent. */
  findNames(ids: readonly string[]): Promise<TemplateNameRow[]>;
  countLive(trainerId: string): Promise<number>;
  create(trainerId: string, data: TemplateWriteData): Promise<WorkoutTemplateWithExercises>;
  /** Full-document replace when `expectedVersion` matches; bumps the version. */
  replaceDocument(
    trainerId: string,
    id: string,
    data: TemplateWriteData,
    expectedVersion: number,
  ): Promise<ReplaceTemplateResult>;
  /** False when there was no live template of this trainer. */
  softDelete(trainerId: string, id: string, now: Date): Promise<boolean>;
  /** Maintenance: hard-deletes templates soft-deleted before `cutoff`. */
  purgeDeletedBefore(cutoff: Date): Promise<number>;
  /**
   * Days copied from these templates in the ACTIVE (unarchived) routine of these
   * users. The caller passes the trainer's ACTIVE clients: a former client's
   * copy is never read.
   */
  listAssignments(
    templateIds: readonly string[],
    userIds: readonly string[],
  ): Promise<TemplateAssignmentRow[]>;
}

const withExercises = {
  exercises: { orderBy: { position: 'asc' } },
} satisfies Prisma.WorkoutTemplateInclude;

function rowData(e: TemplateExerciseWriteData, position: number) {
  return {
    exerciseId: e.exerciseId,
    position,
    sets: e.sets,
    repMin: e.repMin,
    repMax: e.repMax,
    targetRir: e.targetRir,
    restSec: e.restSec,
    supersetGroup: e.supersetGroup,
    defaultLoadKg: e.defaultLoadKg,
    trainerNote: e.trainerNote,
  };
}

export class WorkoutTemplateRepository implements IWorkoutTemplateRepository {
  async listForTrainer(trainerId: string): Promise<WorkoutTemplateWithExercises[]> {
    return prisma.workoutTemplate.findMany({
      where: { trainerId, deletedAt: null },
      include: withExercises,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async find(trainerId: string, id: string): Promise<WorkoutTemplateWithExercises | null> {
    return prisma.workoutTemplate.findFirst({
      where: { id, trainerId, deletedAt: null },
      include: withExercises,
    });
  }

  async findNames(ids: readonly string[]): Promise<TemplateNameRow[]> {
    if (ids.length === 0) return [];
    return prisma.workoutTemplate.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, trainerId: true, name: true, deletedAt: true },
    });
  }

  async countLive(trainerId: string): Promise<number> {
    return prisma.workoutTemplate.count({ where: { trainerId, deletedAt: null } });
  }

  async create(trainerId: string, data: TemplateWriteData): Promise<WorkoutTemplateWithExercises> {
    return prisma.workoutTemplate.create({
      data: {
        trainerId,
        name: data.name,
        workoutType: data.workoutType,
        exercises: { create: data.exercises.map((e, i) => rowData(e, i)) },
      },
      include: withExercises,
    });
  }

  async replaceDocument(
    trainerId: string,
    id: string,
    data: TemplateWriteData,
    expectedVersion: number,
  ): Promise<ReplaceTemplateResult> {
    return prisma.$transaction(async (tx) => {
      // Version check + bump in one statement: the row lock serialises racing saves.
      const bumped = await tx.workoutTemplate.updateMany({
        where: { id, trainerId, deletedAt: null, version: expectedVersion },
        data: { name: data.name, workoutType: data.workoutType, version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        const current = await tx.workoutTemplate.findFirst({
          where: { id, trainerId, deletedAt: null },
          include: withExercises,
        });
        return current ? { status: 'conflict', current } : { status: 'not_found' };
      }

      const existing = await tx.workoutTemplateExercise.findMany({
        where: { templateId: id },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((e) => e.id));
      // A row id is kept only when it belongs to this template, and only once.
      const claimed = new Set<string>();
      const plan = data.exercises.map((e) => {
        const keep = !!e.id && existingIds.has(e.id) && !claimed.has(e.id);
        if (keep && e.id) claimed.add(e.id);
        return { row: e, keptId: keep ? e.id : undefined };
      });

      await tx.workoutTemplateExercise.deleteMany({
        where: { templateId: id, id: { notIn: [...claimed] } },
      });
      for (const [i, { row, keptId }] of plan.entries()) {
        if (keptId) {
          await tx.workoutTemplateExercise.update({
            where: { id: keptId },
            data: rowData(row, i),
          });
        } else {
          await tx.workoutTemplateExercise.create({
            data: { templateId: id, ...rowData(row, i) },
          });
        }
      }
      const template = await tx.workoutTemplate.findUniqueOrThrow({
        where: { id },
        include: withExercises,
      });
      return { status: 'ok', template };
    });
  }

  async softDelete(trainerId: string, id: string, now: Date): Promise<boolean> {
    const res = await prisma.workoutTemplate.updateMany({
      where: { id, trainerId, deletedAt: null },
      data: { deletedAt: now },
    });
    return res.count > 0;
  }

  async purgeDeletedBefore(cutoff: Date): Promise<number> {
    const res = await prisma.workoutTemplate.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    return res.count;
  }

  async listAssignments(
    templateIds: readonly string[],
    userIds: readonly string[],
  ): Promise<TemplateAssignmentRow[]> {
    if (templateIds.length === 0 || userIds.length === 0) return [];
    const rows = await prisma.routineDay.findMany({
      where: {
        templateId: { in: [...templateIds] },
        routine: { userId: { in: [...userIds] }, isActive: true, archivedAt: null },
      },
      select: {
        id: true,
        name: true,
        routineId: true,
        templateId: true,
        templateVersion: true,
        templateAssignedAt: true,
        editedSinceTemplate: true,
        routine: { select: { userId: true } },
      },
      orderBy: [{ templateAssignedAt: 'desc' }, { position: 'asc' }],
    });
    return rows.flatMap((r) =>
      r.templateId === null
        ? []
        : [
            {
              dayId: r.id,
              dayName: r.name,
              routineId: r.routineId,
              userId: r.routine.userId,
              templateId: r.templateId,
              templateVersion: r.templateVersion ?? 1,
              templateAssignedAt: r.templateAssignedAt,
              editedSinceTemplate: r.editedSinceTemplate,
            },
          ],
    );
  }
}

export const workoutTemplateRepository = new WorkoutTemplateRepository();
