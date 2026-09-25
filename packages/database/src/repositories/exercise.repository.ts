import type {
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLoadType,
} from '@prisma/client';
import { prisma } from '../client';

// ─── Gym exercise library (gym_plan.md §2.2) ─────────────────────────────────
// Curated rows (ownerId = null) are shared by everyone and upserted from the
// @chefer/types EXERCISE_CATALOG at API boot. Custom rows belong to one user.
// Rows are never hard-deleted: sessions reference them (archive instead).

export interface ExerciseWriteData {
  name: string;
  aliases: string[];
  category: ExerciseCategory;
  movementPattern: string;
  equipment: ExerciseEquipment;
  loadType: ExerciseLoadType;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  repMin: number;
  repMax: number;
  restSec: number;
  incrementKg: number;
  perHand: boolean;
  isLowerBody: boolean;
  isTimed: boolean;
  swapGroup: string | null;
  cues: string[];
  mistakes: string[];
  blurb: string | null;
  imageKeys: string[];
  videoId: string | null;
  videoStartSec: number | null;
  videoChannel: string | null;
}

export interface CuratedExerciseUpdate extends ExerciseWriteData {
  contentVersion: number;
  archivedAt: Date | null;
}

export interface IExerciseRepository {
  /** Curated + the user's own custom exercises (archived included — history needs them). */
  findVisible(userId: string, updatedSince?: Date): Promise<Exercise[]>;
  /** Only rows the user may see (curated or owned); missing/foreign ids are dropped. */
  findVisibleByIds(userId: string, ids: string[]): Promise<Exercise[]>;
  findById(id: string): Promise<Exercise | null>;
  countCustom(ownerId: string): Promise<number>;
  createCustom(id: string, ownerId: string, data: ExerciseWriteData): Promise<Exercise>;
  updateCustom(id: string, data: Partial<ExerciseWriteData>): Promise<Exercise>;
  archive(id: string): Promise<void>;

  // Curated library maintenance (ensureExerciseLibrary)
  findAllCurated(): Promise<Exercise[]>;
  createCurated(id: string, data: ExerciseWriteData): Promise<void>;
  updateCurated(id: string, data: Partial<CuratedExerciseUpdate>): Promise<void>;
}

export class ExerciseRepository implements IExerciseRepository {
  async findVisible(userId: string, updatedSince?: Date): Promise<Exercise[]> {
    return prisma.exercise.findMany({
      where: {
        OR: [{ ownerId: null }, { ownerId: userId }],
        ...(updatedSince && { updatedAt: { gte: updatedSince } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findVisibleByIds(userId: string, ids: string[]): Promise<Exercise[]> {
    if (ids.length === 0) return [];
    return prisma.exercise.findMany({
      where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: userId }] },
    });
  }

  async findById(id: string): Promise<Exercise | null> {
    return prisma.exercise.findUnique({ where: { id } });
  }

  async countCustom(ownerId: string): Promise<number> {
    return prisma.exercise.count({ where: { ownerId, archivedAt: null } });
  }

  async createCustom(id: string, ownerId: string, data: ExerciseWriteData): Promise<Exercise> {
    return prisma.exercise.create({ data: { id, ownerId, ...data } });
  }

  async updateCustom(id: string, data: Partial<ExerciseWriteData>): Promise<Exercise> {
    return prisma.exercise.update({
      where: { id },
      data: { ...data, contentVersion: { increment: 1 } },
    });
  }

  async archive(id: string): Promise<void> {
    await prisma.exercise.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async findAllCurated(): Promise<Exercise[]> {
    return prisma.exercise.findMany({ where: { ownerId: null } });
  }

  async createCurated(id: string, data: ExerciseWriteData): Promise<void> {
    await prisma.exercise.create({ data: { id, ownerId: null, ...data } });
  }

  async updateCurated(id: string, data: Partial<CuratedExerciseUpdate>): Promise<void> {
    await prisma.exercise.update({ where: { id }, data });
  }
}

export const exerciseRepository = new ExerciseRepository();
