import type { Prisma } from '@prisma/client';
import { prisma } from '../client';

// ─── Recipe images (F3, 2026-10-17) ───────────────────────────────────────────
// Until 2026-10-17 recipes whose image could not be generated got a free
// Pollinations URL (deterministic per dish name + cuisine). The API's
// RecipeImageBackfillWorker replaces them with generated images through this
// repository: it picks the next URL to replace and swaps it on every row that
// holds it (name reuse and copies share the same URL).

/** The host of the retired Pollinations fallback images. */
export const POLLINATIONS_IMAGE_HOST = 'image.pollinations.ai';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One Pollinations URL to replace, with a recipe that holds it (for the prompt). */
export type BackfillCandidate = {
  imageUrl: string;
  recipeId: string;
  name: string;
  cuisineType: string;
};

export interface IRecipeImageRepository {
  /**
   * Up to `limit` distinct Pollinations URLs still stored on live recipes, in
   * backfill order (owner, 2026-10-17): recipes on a plan whose week is current
   * or upcoming, then favourited ones, then the curated pool, then the rest,
   * newest first. `excludeUrls` are skipped.
   */
  findBackfillCandidates(
    limit: number,
    excludeUrls: string[],
    now?: Date,
  ): Promise<BackfillCandidate[]>;
  /** Recipe rows still on a Pollinations image (progress logging). */
  countPollinationsImages(): Promise<number>;
  /** Swaps `oldUrl` for `newUrl` on every recipe that still holds it; returns the row count. */
  replaceImageUrl(oldUrl: string, newUrl: string): Promise<number>;
}

export class RecipeImageRepository implements IRecipeImageRepository {
  async findBackfillCandidates(
    limit: number,
    excludeUrls: string[],
    now: Date = new Date(),
  ): Promise<BackfillCandidate[]> {
    const planned = await this.plannedRecipeIds(now);
    const tiers: Prisma.RecipeWhereInput[] = [
      { id: { in: planned } },
      { favourites: { some: {} } },
      { source: 'CURATED' },
      {},
    ];
    const out: BackfillCandidate[] = [];
    const seen = new Set(excludeUrls);
    for (const tier of tiers) {
      if (out.length >= limit) break;
      const rows = await prisma.recipe.findMany({
        where: {
          ...tier,
          deletedAt: null,
          AND: [
            { imageUrl: { contains: POLLINATIONS_IMAGE_HOST } },
            ...(seen.size > 0 ? [{ imageUrl: { notIn: [...seen] } }] : []),
          ],
        },
        select: { id: true, imageUrl: true, name: true, cuisineType: true },
        orderBy: { createdAt: 'desc' },
        distinct: ['imageUrl'],
        take: limit - out.length,
      });
      for (const r of rows) {
        if (!r.imageUrl || seen.has(r.imageUrl)) continue;
        seen.add(r.imageUrl);
        out.push({
          imageUrl: r.imageUrl,
          recipeId: r.id,
          name: r.name,
          cuisineType: r.cuisineType,
        });
      }
    }
    return out;
  }

  countPollinationsImages(): Promise<number> {
    return prisma.recipe.count({ where: { imageUrl: { contains: POLLINATIONS_IMAGE_HOST } } });
  }

  async replaceImageUrl(oldUrl: string, newUrl: string): Promise<number> {
    const { count } = await prisma.recipe.updateMany({
      where: { imageUrl: oldUrl },
      data: { imageUrl: newUrl },
    });
    return count;
  }

  /** Recipe ids on non-template plans whose week has not ended yet. */
  private async plannedRecipeIds(now: Date): Promise<string[]> {
    const days = await prisma.mealPlanDay.findMany({
      where: {
        mealPlan: {
          isTemplate: false,
          weekStartDate: { gt: new Date(now.getTime() - 7 * DAY_MS) },
        },
      },
      select: { meals: true },
    });
    const ids = new Set<string>();
    for (const day of days) {
      if (!Array.isArray(day.meals)) continue;
      for (const slot of day.meals) {
        const id = (slot as { recipeId?: unknown } | null)?.recipeId;
        if (typeof id === 'string') ids.add(id);
      }
    }
    return [...ids];
  }
}

export const recipeImageRepository = new RecipeImageRepository();
