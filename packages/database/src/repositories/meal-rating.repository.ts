import type { MealRating } from '@prisma/client';
import { prisma } from '../client.js';

export interface IMealRatingRepository {
  upsert(data: {
    userId: string;
    recipeId: string;
    rating: number;
    notes?: string;
  }): Promise<MealRating>;
  findByUserAndRecipe(userId: string, recipeId: string): Promise<MealRating | null>;
  findByUser(userId: string): Promise<MealRating[]>;
}

export class MealRatingRepository implements IMealRatingRepository {
  async upsert(data: {
    userId: string;
    recipeId: string;
    rating: number;
    notes?: string;
  }): Promise<MealRating> {
    return prisma.mealRating.upsert({
      where: { userId_recipeId: { userId: data.userId, recipeId: data.recipeId } },
      create: {
        userId: data.userId,
        recipeId: data.recipeId,
        rating: data.rating,
        notes: data.notes ?? null,
      },
      update: {
        rating: data.rating,
        notes: data.notes ?? null,
        ratedAt: new Date(),
      },
    });
  }

  async findByUserAndRecipe(userId: string, recipeId: string): Promise<MealRating | null> {
    return prisma.mealRating.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });
  }

  async findByUser(userId: string): Promise<MealRating[]> {
    return prisma.mealRating.findMany({
      where: { userId },
      orderBy: { ratedAt: 'desc' },
    });
  }
}

export const mealRatingRepository = new MealRatingRepository();
