import { TRPCError } from '@trpc/server';
import {
  favouriteRecipeRepository,
  type IFavouriteRecipeRepository,
  type Recipe,
} from '@chefer/database';
import { isHiddenForeignRecipe, isRecipeOpenTo } from './recipe-access.js';

// ─── Following: "add to my week" = your own copy (PRD §13, FD-7, INV-5) ───────
// Anything written into the viewer's own records — a plan slot, a pinned
// favourite placed at generation, a food-log entry — must reference a recipe
// the viewer owns or an open (AI/CURATED) one, so plans and logs stay stable
// whatever the original's owner does later (edit, hide, delete, leave).
// Another user's MANUAL recipe is resolved here to the viewer's private copy,
// made at most once per viewer and source (the repository's SERIALIZABLE
// find-or-create — there is no DB unique, plan §2.3) and reused after that
// (FR-17.7).
//
// Callers check visibility FIRST (`findRecipeVisibleTo`): this service copies
// whatever it is handed — except an auto-hidden recipe (F3.1, PRD §13): a
// heart made before the hide still OPENS it, but no new copy is made, so the
// hidden name and photo can't travel into the copier's week (which their own
// followers see). That answers NOT_FOUND `Recipe not found.`, the same as a
// recipe the caller can't see; callers that must not fail (generation's
// pinned favourites) skip such a recipe first (`isHiddenForeignRecipe`).

export interface OwnedRecipe {
  /** The row to write into the viewer's records: the recipe itself, or the viewer's copy. */
  recipe: Recipe;
  /** The original's id when `recipe` is a copy (new or reused), else null. */
  copiedFromId: string | null;
  /** True when this call created the copy. */
  created: boolean;
}

export class RecipeCopyService {
  constructor(
    private readonly repo: Pick<
      IFavouriteRecipeRepository,
      'findOrCreateCopy'
    > = favouriteRecipeRepository,
  ) {}

  /** The recipe id to write into `viewerId`'s own records (INV-5). */
  async ownedIdFor(viewerId: string, recipe: Recipe): Promise<string> {
    return (await this.ownedRecipeFor(viewerId, recipe)).recipe.id;
  }

  /**
   * Open (AI/CURATED) or the viewer's own recipe → itself. Another user's
   * MANUAL recipe → the viewer's copy (text, ingredients, nutrition, photo
   * URL, `sourceUrl`, origins).
   */
  async ownedRecipeFor(viewerId: string, recipe: Recipe): Promise<OwnedRecipe> {
    if (isRecipeOpenTo(recipe, viewerId)) {
      return { recipe, copiedFromId: null, created: false };
    }
    if (isHiddenForeignRecipe(recipe, viewerId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const { recipe: copy, created } = await this.repo.findOrCreateCopy(viewerId, recipe);
    return { recipe: copy, copiedFromId: recipe.id, created };
  }
}

export const recipeCopyService = new RecipeCopyService();
