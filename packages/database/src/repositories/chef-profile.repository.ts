import type { ActivityLevel, BiologicalSex, ChefProfile, Goal, Prisma } from '@prisma/client';
import { prisma } from '../client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ActivityLevel, BiologicalSex, Goal };

export interface UpsertChefProfileData {
  displayName?: string | null;
  biologicalSex?: BiologicalSex | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  goal?: Goal | null;
  dailyCalorieTarget?: number | null;
  deliveryAddress?: string | null;
  deliveryCurrency?: string | null;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IChefProfileRepository {
  findByUserId(userId: string): Promise<ChefProfile | null>;
  upsert(userId: string, data: UpsertChefProfileData): Promise<ChefProfile>;
  delete(userId: string): Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ChefProfileRepository implements IChefProfileRepository {
  async findByUserId(userId: string): Promise<ChefProfile | null> {
    return prisma.chefProfile.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: UpsertChefProfileData): Promise<ChefProfile> {
    const payload: Prisma.ChefProfileUncheckedCreateInput = {
      userId,
      ...data,
    };
    return prisma.chefProfile.upsert({
      where: { userId },
      create: payload,
      update: data,
    });
  }

  async delete(userId: string): Promise<void> {
    await prisma.chefProfile.delete({ where: { userId } });
  }
}

export const chefProfileRepository = new ChefProfileRepository();
