import type {
  GymEquipmentAccess,
  GymProfile,
  Prisma,
  TrainingExperience,
  WeightUnit,
} from '@prisma/client';
import { prisma } from '../client';
import {
  createRoutineInTx,
  type RoutineCreateData,
  type RoutineWithDays,
} from './routine.repository';

// ─── Gym profile (gym_plan.md §2.2) ──────────────────────────────────────────
// Setup answers + equipment inventory. `goalHistory` and `offerState` are JSON
// bags whose shapes are owned by the API service layer.

export interface GymProfileWriteData {
  experience: TrainingExperience;
  equipmentAccess: GymEquipmentAccess;
  unit: WeightUnit;
  weeklyGoal: number;
  goalHistory: Prisma.InputJsonValue;
  barWeightKg: number;
  platePairsKg: number[];
  dumbbellsKg: number[];
  machineStepKg: number;
  cableStepKg: number;
  hasDipBelt: boolean;
  microPlates: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  offerState: Prisma.InputJsonValue;
}

export type GymProfileUpdateData = Partial<GymProfileWriteData>;

export interface InitialProgressionData {
  exerciseId: string;
  repBucket: string;
  state: Prisma.InputJsonValue;
  engineVersion: number;
}

export interface CompleteSetupData {
  profile: GymProfileWriteData;
  routine: RoutineCreateData;
  /** Seeded with createMany(skipDuplicates): history-derived rows are never clobbered. */
  progressions: InitialProgressionData[];
}

export interface IGymProfileRepository {
  findByUserId(userId: string): Promise<GymProfile | null>;
  update(userId: string, data: GymProfileUpdateData): Promise<GymProfile>;
  /** Profile upsert + new active routine + initial progressions, in ONE transaction. */
  completeSetup(
    userId: string,
    data: CompleteSetupData,
  ): Promise<{ profile: GymProfile; routine: RoutineWithDays }>;
}

export class GymProfileRepository implements IGymProfileRepository {
  async findByUserId(userId: string): Promise<GymProfile | null> {
    return prisma.gymProfile.findUnique({ where: { userId } });
  }

  async update(userId: string, data: GymProfileUpdateData): Promise<GymProfile> {
    return prisma.gymProfile.update({ where: { userId }, data });
  }

  async completeSetup(
    userId: string,
    data: CompleteSetupData,
  ): Promise<{ profile: GymProfile; routine: RoutineWithDays }> {
    return prisma.$transaction(async (tx) => {
      const setupCompletedAt = new Date();
      const profile = await tx.gymProfile.upsert({
        where: { userId },
        create: { userId, ...data.profile, setupCompletedAt },
        update: { ...data.profile, setupCompletedAt },
      });
      const routine = await createRoutineInTx(tx, userId, data.routine);
      if (data.progressions.length > 0) {
        await tx.exerciseProgression.createMany({
          data: data.progressions.map((p) => ({ userId, ...p })),
          skipDuplicates: true,
        });
      }
      return { profile, routine };
    });
  }
}

export const gymProfileRepository = new GymProfileRepository();
