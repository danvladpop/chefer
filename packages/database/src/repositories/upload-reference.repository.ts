import { prisma } from '../client';

// ─── Who still points at an uploaded file? (Phase 1 guardrails) ──────────────
// Files in the uploads volume (user photos and generated recipe images under
// recipes/) are referenced by URL from these columns. Both the orphan sweeper
// and every file delete (account deletion) ask here first, so a file another
// row still uses is never removed — copying a friend's recipe reuses the SAME
// image URL (favourite-recipe.repository `copyRecipe`), and deleting the
// author's account used to delete the copy's photo with it.
//
// ADD A COLUMN HERE when a new column stores an /uploads URL.

export interface PurgeResult {
  /** Soft-deleted recipes hard-deleted. */
  purged: number;
  /** Past the grace period but still referenced by a plan or a food log — kept. */
  keptInUse: number;
}

export interface IUploadReferenceRepository {
  /**
   * Stored image URLs that contain `/uploads/`. With `fragments`, only the
   * URLs containing one of them (e.g. `/uploads/<file>`), for a targeted check.
   */
  findUploadUrls(fragments?: string[]): Promise<string[]>;
  /**
   * Hard-deletes recipes soft-deleted (`deletedAt`) before `deletedBefore`,
   * skipping any recipe a meal plan day or a daily food log still names (the
   * soft delete keeps those slots resolving as a tombstone). Every FK onto
   * `recipes` is CASCADE (favourites, ratings, recipe lines) or SET NULL
   * (other users' copies' `originRecipeId`), so the delete cannot be blocked.
   */
  purgeSoftDeletedRecipes(deletedBefore: Date, maxPurge: number): Promise<PurgeResult>;
}

const FRAGMENT_CHUNK = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function urlsOf<T>(rows: T[], pick: (row: T) => string | null): string[] {
  return rows.map(pick).filter((u): u is string => u !== null);
}

export class UploadReferenceRepository implements IUploadReferenceRepository {
  async findUploadUrls(fragments?: string[]): Promise<string[]> {
    if (fragments === undefined) return this.urlsMatching(['/uploads/']);
    if (fragments.length === 0) return [];
    const found = await Promise.all(
      chunks(fragments, FRAGMENT_CHUNK).map((part) => this.urlsMatching(part)),
    );
    return found.flat();
  }

  private async urlsMatching(fragments: string[]): Promise<string[]> {
    const any = <K extends string>(column: K) =>
      fragments.map((f) => ({ [column]: { contains: f } }) as Record<K, { contains: string }>);
    const [users, recipes, prices, ingredients, ingredientImages, posts] = await Promise.all([
      prisma.user.findMany({ where: { OR: any('image') }, select: { image: true } }),
      // Soft-deleted recipes count: their slots still render (tombstones)
      // until the 30-day purge removes the row.
      prisma.recipe.findMany({ where: { OR: any('imageUrl') }, select: { imageUrl: true } }),
      prisma.ingredientPrice.findMany({
        where: { OR: any('imageUrl') },
        select: { imageUrl: true },
      }),
      prisma.ingredient.findMany({ where: { OR: any('imageUrl') }, select: { imageUrl: true } }),
      prisma.ingredientImage.findMany({
        where: { OR: any('imageUrl') },
        select: { imageUrl: true },
      }),
      prisma.post.findMany({ where: { OR: any('coverImage') }, select: { coverImage: true } }),
    ]);
    return [
      ...urlsOf(users, (r) => r.image),
      ...urlsOf(recipes, (r) => r.imageUrl),
      ...urlsOf(prices, (r) => r.imageUrl),
      ...urlsOf(ingredients, (r) => r.imageUrl),
      ...urlsOf(ingredientImages, (r) => r.imageUrl),
      ...urlsOf(posts, (r) => r.coverImage),
    ];
  }

  async purgeSoftDeletedRecipes(deletedBefore: Date, maxPurge: number): Promise<PurgeResult> {
    const candidates = await prisma.recipe.findMany({
      where: { deletedAt: { lt: deletedBefore } },
      select: { id: true },
      orderBy: { deletedAt: 'asc' },
    });
    const purgeable: string[] = [];
    let keptInUse = 0;
    for (const { id } of candidates) {
      if (purgeable.length >= maxPurge) break;
      // `meals` / `loggedMeals` are JSON arrays of objects; array_contains is
      // jsonb @>, which matches an element carrying this recipeId.
      const [planDay, log] = await Promise.all([
        prisma.mealPlanDay.findFirst({
          where: { meals: { array_contains: [{ recipeId: id }] } },
          select: { id: true },
        }),
        prisma.dailyLog.findFirst({
          where: { loggedMeals: { array_contains: [{ recipeId: id }] } },
          select: { id: true },
        }),
      ]);
      if (planDay || log) keptInUse += 1;
      else purgeable.push(id);
    }
    if (purgeable.length === 0) return { purged: 0, keptInUse };
    const { count } = await prisma.recipe.deleteMany({
      // Re-check deletedAt: a restore since the read keeps the recipe.
      where: { id: { in: purgeable }, deletedAt: { lt: deletedBefore } },
    });
    return { purged: count, keptInUse };
  }
}

export const uploadReferenceRepository = new UploadReferenceRepository();
