import type { MealRating } from '@prisma/client';
import { prisma } from '../client';

/** A rating joined to the fields the AI prompt can learn from (P1-1). */
export interface RatingSignal {
  rating: number;
  recipeName: string;
  cuisineType: string;
  dietaryTags: string[];
}

export interface IMealRatingRepository {
  upsert(data: {
    userId: string;
    recipeId: string;
    rating: number;
    notes?: string;
  }): Promise<MealRating>;
  findByUserAndRecipe(userId: string, recipeId: string): Promise<MealRating | null>;
  findByUser(userId: string): Promise<MealRating[]>;
  findSignalsForUser(userId: string, limit?: number): Promise<RatingSignal[]>;
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

  /**
   * The user's most recent ratings joined to recipe name/cuisine/tags — the
   * signal fed into premium plan generation (P1-1). Capped so the prompt
   * stays bounded.
   */
  async findSignalsForUser(userId: string, limit = 20): Promise<RatingSignal[]> {
    const rows = await prisma.mealRating.findMany({
      where: { userId },
      orderBy: { ratedAt: 'desc' },
      take: limit,
      include: { recipe: { select: { name: true, cuisineType: true, dietaryTags: true } } },
    });
    return rows.map(
      (r: {
        rating: number;
        recipe: { name: string; cuisineType: string; dietaryTags: string[] };
      }) => ({
        rating: r.rating,
        recipeName: r.recipe.name,
        cuisineType: r.recipe.cuisineType,
        dietaryTags: r.recipe.dietaryTags,
      }),
    );
  }
}

export const mealRatingRepository = new MealRatingRepository();
