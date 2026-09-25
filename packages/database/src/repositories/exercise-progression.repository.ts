import { Prisma, type ExerciseProgression } from '@prisma/client';
import { prisma } from '../client';

// ─── Exercise progression (gym_plan.md §2.1) ─────────────────────────────────
// A DERIVED CACHE keyed by (user, exercise, rep bucket): the API recomputes
// `state` by folding the engine over completed sessions. `override` is the
// user's edit of the next targets and is never touched by a recompute.

export interface ProgressionStateWrite {
  exerciseId: string;
  repBucket: string;
  state: Prisma.InputJsonValue;
  engineVersion: number;
}

export interface IExerciseProgressionRepository {
  findForUser(userId: string, exerciseIds?: string[]): Promise<ExerciseProgression[]>;
  find(userId: string, exerciseId: string, repBucket: string): Promise<ExerciseProgression | null>;
  /** Upserts `state` for many keys in one transaction (override preserved). */
  upsertStates(userId: string, rows: ProgressionStateWrite[]): Promise<void>;
  /** null clears the override. */
  setOverride(
    userId: string,
    exerciseId: string,
    repBucket: string,
    override: Prisma.InputJsonValue | null,
  ): Promise<ExerciseProgression>;
}

export class ExerciseProgressionRepository implements IExerciseProgressionRepository {
  async findForUser(userId: string, exerciseIds?: string[]): Promise<ExerciseProgression[]> {
    if (exerciseIds?.length === 0) return [];
    return prisma.exerciseProgression.findMany({
      where: { userId, ...(exerciseIds && { exerciseId: { in: exerciseIds } }) },
      orderBy: [{ exerciseId: 'asc' }, { repBucket: 'asc' }],
    });
  }

  async find(
    userId: string,
    exerciseId: string,
    repBucket: string,
  ): Promise<ExerciseProgression | null> {
    return prisma.exerciseProgression.findUnique({
      where: { userId_exerciseId_repBucket: { userId, exerciseId, repBucket } },
    });
  }

  async upsertStates(userId: string, rows: ProgressionStateWrite[]): Promise<void> {
    if (rows.length === 0) return;
    await prisma.$transaction(
      rows.map((r) =>
        prisma.exerciseProgression.upsert({
          where: {
            userId_exerciseId_repBucket: {
              userId,
              exerciseId: r.exerciseId,
              repBucket: r.repBucket,
            },
          },
          create: { userId, ...r },
          update: { state: r.state, engineVersion: r.engineVersion },
        }),
      ),
    );
  }

  async setOverride(
    userId: string,
    exerciseId: string,
    repBucket: string,
    override: Prisma.InputJsonValue | null,
  ): Promise<ExerciseProgression> {
    return prisma.exerciseProgression.update({
      where: { userId_exerciseId_repBucket: { userId, exerciseId, repBucket } },
      data:
        override === null
          ? { override: Prisma.DbNull, overrideAt: null }
          : { override, overrideAt: new Date() },
    });
  }
}

export const exerciseProgressionRepository = new ExerciseProgressionRepository();
