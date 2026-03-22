import type { DietaryPreferences, Prisma } from '@prisma/client';
import { prisma } from '../client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpsertDietaryPreferencesData {
  cuisinePreferences?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  dislikedIngredients?: string[];
  mealsPerDay?: number;
  servingSize?: number;
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
}

export const dietaryPreferencesRepository = new DietaryPreferencesRepository();
