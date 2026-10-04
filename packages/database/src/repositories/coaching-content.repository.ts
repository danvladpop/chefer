import type {
  Exercise,
  GymProfile,
  Prisma,
  SessionExercise,
  SessionSet,
  WorkoutSession,
} from '@prisma/client';
import { prisma } from '../client';
import type { ClientNameRow } from './coaching-link.repository';

// ─── Trainer coaching: read-only queries over a client's data ─────────────────
// (docs/trainer-platform/spec.md §7.2, §8.1). Every method takes the CLIENT's
// user id; the caller (CoachingContentService) has already authorised the
// trainer through CoachingAccessService. Nothing here writes. Only the columns
// a trainer may see are selected where a row would otherwise carry more: no
// session or exercise notes, no heart rate or calorie columns reach the
// service's mappers because the mappers allow-list fields (coaching-dto.mappers.ts).

/** The exercise columns a coached workout view reads. */
export type CoachedExerciseMeta = Pick<Exercise, 'id' | 'name' | 'ownerId' | 'trackingType'>;

export type CoachedSessionRow = WorkoutSession & {
  exercises: (SessionExercise & { sets: SessionSet[]; exercise: CoachedExerciseMeta })[];
};

export interface CoachedSessionCursor {
  startedAt: Date;
  id: string;
}

export interface ActiveRoutineStamp {
  userId: string;
  lastEditedById: string | null;
  lastEditedAt: Date | null;
}

export interface ICoachingContentRepository {
  /** Completed sessions with `localDate >= fromLocalDate`, newest first, keyset-paged. */
  listCompleted(
    userId: string,
    opts: { fromLocalDate: string; cursor: CoachedSessionCursor | null; take: number },
  ): Promise<CoachedSessionRow[]>;
  /** Completed sessions with `localDate >= fromLocalDate` that contain `exerciseId` (only that exercise's rows), newest first. */
  listCompletedForExercise(
    userId: string,
    exerciseId: string,
    opts: { fromLocalDate: string; take: number },
  ): Promise<CoachedSessionRow[]>;
  /** Latest completed-session `localDate` per user. */
  lastWorkoutDates(userIds: string[]): Promise<Map<string, string>>;
  /** Completed sessions per user with `from <= localDate <= to`. */
  countSessions(userIds: string[], from: string, to: string): Promise<Map<string, number>>;
  gymProfiles(userIds: string[]): Promise<Map<string, GymProfile>>;
  /** The edit stamp of each user's ACTIVE routine. */
  activeRoutineStamps(userIds: string[]): Promise<Map<string, ActiveRoutineStamp>>;
  /** Name columns only. */
  userNames(userIds: string[]): Promise<Map<string, ClientNameRow>>;
}

const withMeta = {
  exercises: {
    orderBy: { position: 'asc' },
    include: {
      exercise: { select: { id: true, name: true, ownerId: true, trackingType: true } },
      sets: { orderBy: { position: 'asc' } },
    },
  },
} satisfies Prisma.WorkoutSessionInclude;

export class CoachingContentRepository implements ICoachingContentRepository {
  async listCompleted(
    userId: string,
    opts: { fromLocalDate: string; cursor: CoachedSessionCursor | null; take: number },
  ): Promise<CoachedSessionRow[]> {
    const { cursor } = opts;
    return prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        localDate: { gte: opts.fromLocalDate },
        ...(cursor && {
          OR: [
            { startedAt: { lt: cursor.startedAt } },
            { startedAt: cursor.startedAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: opts.take,
      include: withMeta,
    });
  }

  async listCompletedForExercise(
    userId: string,
    exerciseId: string,
    opts: { fromLocalDate: string; take: number },
  ): Promise<CoachedSessionRow[]> {
    return prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        localDate: { gte: opts.fromLocalDate },
        exercises: { some: { exerciseId } },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: opts.take,
      include: {
        exercises: {
          where: { exerciseId },
          orderBy: { position: 'asc' },
          include: withMeta.exercises.include,
        },
      },
    });
  }

  async lastWorkoutDates(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.workoutSession.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'COMPLETED' },
      _max: { localDate: true },
    });
    return new Map(
      rows.flatMap((r) =>
        r._max.localDate === null ? [] : [[r.userId, r._max.localDate] as const],
      ),
    );
  }

  async countSessions(userIds: string[], from: string, to: string): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.workoutSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: 'COMPLETED',
        localDate: { gte: from, lte: to },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.userId, r._count._all]));
  }

  async gymProfiles(userIds: string[]): Promise<Map<string, GymProfile>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.gymProfile.findMany({ where: { userId: { in: userIds } } });
    return new Map(rows.map((r) => [r.userId, r]));
  }

  async activeRoutineStamps(userIds: string[]): Promise<Map<string, ActiveRoutineStamp>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.routine.findMany({
      where: { userId: { in: userIds }, isActive: true, archivedAt: null },
      select: { userId: true, lastEditedById: true, lastEditedAt: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });
    // The newest active routine wins, like `findActive`.
    return new Map(rows.map((r) => [r.userId, r]));
  }

  async userNames(userIds: string[]): Promise<Map<string, ClientNameRow>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }
}

export const coachingContentRepository = new CoachingContentRepository();
