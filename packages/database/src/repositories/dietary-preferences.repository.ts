import type { DietaryPreferences, Prisma } from '@prisma/client';
import { prisma } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpsertDietaryPreferencesData {
  cuisinePreferences?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  dislikedIngredients?: string[];
  mealsPerDay?: number;
  servingSize?: number;
  // §2.3, T-07.1 (S1) — plan shape. [] = legacy (see @chefer/utils plan-shape.ts).
  planSlots?: string[];
  planDays?: number[];
  timeCapMins?: number | null;
  weekendNoLimit?: boolean;
  cookingFor?: number | null;
  leftovers?: boolean;
  // §2.1, T-01.3/T-01.9 (S2, rev 2)
  safetyReviewedAt?: Date | null;
  excludeLabelDependent?: boolean;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IDietaryPreferencesRepository {
  findByUserId(userId: string): Promise<DietaryPreferences | null>;
  upsert(userId: string, data: UpsertDietaryPreferencesData): Promise<DietaryPreferences>;
  delete(userId: string): Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class DietaryPreferencesRepository implements IDietaryPreferencesRepository {
  async findByUserId(userId: string): Promise<DietaryPreferences | null> {
    return prisma.dietaryPreferences.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: UpsertDietaryPreferencesData): Promise<DietaryPreferences> {
    const payload: Prisma.DietaryPreferencesUncheckedCreateInput = {
      userId,
      ...data,
    };
    return prisma.dietaryPreferences.upsert({
      where: { userId },
      create: payload,
      update: data,
    });
  }

  async delete(userId: string): Promise<void> {
    await prisma.dietaryPreferences.delete({ where: { userId } });
  }

  clearHealthData(userId: string): Prisma.PrismaPromise<Prisma.BatchPayload> {
    return prisma.dietaryPreferences.updateMany({
      where: { userId },
      data: {
        allergies: [],
        dietaryRestrictions: [],
        dislikedIngredients: [],
        safetyReviewedAt: null,
        excludeLabelDependent: false,
      },
    });
  }
}

export const dietaryPreferencesRepository = new DietaryPreferencesRepository();
