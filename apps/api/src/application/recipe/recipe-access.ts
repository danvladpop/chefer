import {
  favouriteRecipeRepository,
  mealPlanRepository,
  type IMealPlanRepository,
  type Recipe,
  type RecipeHiddenReason,
} from '@chefer/database';
import type { SectionAccess } from '@chefer/types';
import { displayNameOf, firstNameOf } from '@chefer/utils';
import { socialAccessService } from '../friends/social-access.service.js';

/**
 * Who may see a recipe.
 *
 * MANUAL recipes — written or imported by a user — are private to their
 * creator. AI and CURATED recipes are open: they carry no personal content,
 * and older AI rows are shared between users' plans by design. A recipe that
 * already sits in one of the user's own plans stays visible whoever made it,
 * so a plan never shows a dish its owner can't open.
 *
 * Before this check, any signed-in user could read, favourite, rate, pin or
 * copy another user's private recipe by id (audit F-REC-2-1, F-REC-2-2,
 * F-X-4-1, F-PLAN-3-1).
 *
 * Following (docs/friends/implementation-plan.md §4.3) adds one more way in:
 * the ORIGINAL (not a copy) MANUAL recipe of someone whose recipes the viewer
 * may see (`SocialAccessService.resolve(...).can.recipes === 'visible'`),
 * imported ones included (Q-F-7), and an auto-hidden one only for a viewer
 * who hearted it before the hide (PRD FR-17.3). Gated by
 * `isFriendsEnabledFor(viewer)` so the kill switch closes it at once.
 */
export function isRecipeOpenTo(
  recipe: Pick<Recipe, 'source' | 'creatorId'>,
  userId: string,
): boolean {
  return recipe.source !== 'MANUAL' || recipe.creatorId === userId;
}

/**
 * Another user's original MANUAL recipe — the only kind the social branch
 * can open. Copies (`originRecipeId` set) are never re-shared (PRD §13).
 */
export function isSocialRecipeCandidate(
  recipe: Pick<Recipe, 'source' | 'creatorId'> & { originRecipeId?: string | null },
  userId: string,
): boolean {
  return (
    recipe.source === 'MANUAL' &&
    recipe.creatorId !== null &&
    recipe.creatorId !== userId &&
    recipe.originRecipeId == null
  );
}

/**
 * Another user's recipe that automatic moderation hid (PRD §9.3). A viewer
 * who hearted it before the hide may still OPEN it (FR-17.3), but nothing may
 * newly copy it into their records (PRD §13: "can't be newly hearted or
 * added") — a fresh copy would carry the hidden name and photo into the
 * copier's week, where their own followers see it (F3.1).
 */
export function isHiddenForeignRecipe(
  recipe: Pick<Recipe, 'creatorId'> & { hiddenAt?: Date | null },
  userId: string,
): boolean {
  return recipe.hiddenAt != null && recipe.creatorId !== userId;
}

/** What the social branch needs. Injectable for tests; the default is lazy. */
export interface RecipeSocialDeps {
  /** `isFriendsEnabledFor(userId)` — the flag or the allowlist. */
  isEnabled(userId: string): Promise<boolean>;
  /** The viewer's recipes-section access to the owner (`SocialAccess.can.recipes`). */
  recipesAccess(viewerId: string, ownerId: string): Promise<SectionAccess>;
  /** Whether the viewer has hearted the recipe (hidden recipes stay open to them). */
  hasHearted(userId: string, recipeId: string): Promise<boolean>;
}

/**
 * `isFriendsEnabledFor`, loaded lazily: lib/friends-middleware imports the
 * env (which validates at load), and this module sits under services whose
 * tests run without one — the lazy `lib/flags` import precedent in
 * meal-plan.service.ts. A load failure fails CLOSED (no social access).
 */
export async function friendsEnabledFor(userId: string): Promise<boolean> {
  try {
    const { isFriendsEnabledFor } = await import('../../lib/friends-middleware.js');
    return isFriendsEnabledFor(userId);
  } catch {
    return false;
  }
}

export const defaultRecipeSocialDeps: RecipeSocialDeps = {
  isEnabled: friendsEnabledFor,
  recipesAccess: async (viewerId, ownerId) =>
    (await socialAccessService.resolve(viewerId, ownerId)).can.recipes,
  hasHearted: (userId, recipeId) => favouriteRecipeRepository.isSaved(userId, recipeId),
};

/**
 * Whether `userId` may see `recipe` (already loaded). Same rules as
 * `findRecipeVisibleTo`; lets callers that hold the row skip a re-read.
 */
export async function isRecipeVisibleTo(
  userId: string,
  recipe: Recipe,
  repo: Pick<IMealPlanRepository, 'isRecipeInUserPlans'> = mealPlanRepository,
  social: RecipeSocialDeps = defaultRecipeSocialDeps,
): Promise<boolean> {
  if (isRecipeOpenTo(recipe, userId)) return true;
  if (await repo.isRecipeInUserPlans(userId, recipe.id)) return true;
  return isSociallyVisible(userId, recipe, social);
}

/** The Following branch alone (§4.3). Every check fails closed. */
async function isSociallyVisible(
  userId: string,
  recipe: Recipe,
  social: RecipeSocialDeps,
): Promise<boolean> {
  if (!isSocialRecipeCandidate(recipe, userId) || recipe.creatorId === null) return false;
  if (!(await social.isEnabled(userId))) return false;
  if ((await social.recipesAccess(userId, recipe.creatorId)) !== 'visible') return false;
  if (recipe.hiddenAt == null) return true;
  // Auto-hidden (PRD §9.3): existing hearts keep working; nobody new gets in.
  return social.hasHearted(userId, recipe.id);
}

/**
 * Loads a recipe if the user may see it. Returns null both when it doesn't
 * exist and when it's someone else's private recipe, so callers answer
 * NOT_FOUND either way and ids can't be probed.
 */
export async function findRecipeVisibleTo(
  userId: string,
  recipeId: string,
  repo: Pick<IMealPlanRepository, 'findRecipeById' | 'isRecipeInUserPlans'> = mealPlanRepository,
  social: RecipeSocialDeps = defaultRecipeSocialDeps,
): Promise<Recipe | null> {
  const recipe = await repo.findRecipeById(recipeId);
  if (!recipe) return null;
  return (await isRecipeVisibleTo(userId, recipe, repo, social)) ? recipe : null;
}

// ─── Attribution (additive DTO fields, plan §4.2 "Existing procedures") ────────

/** `By {name}` on another user's recipe (FR-17.1). */
export interface RecipeCreatorDto {
  id: string;
  displayName: string;
  firstName: string;
}

/** `From {first}` on the viewer's copy; a null name reads `From another Chefer cook`. */
export interface RecipeOriginDto {
  creatorFirstName: string | null;
}

/** The owner's own auto-hidden recipe (UX §9.4 banner). Never sent to anyone else. */
export interface RecipeHiddenDto {
  reason: RecipeHiddenReason;
}

/** The optional attribution keys a recipe row/DTO may gain. Absent = not applicable. */
export interface RecipeAttribution {
  creator?: RecipeCreatorDto;
  origin?: RecipeOriginDto;
  hidden?: RecipeHiddenDto;
}

type NameParts = { firstName: string | null; lastName: string | null; name: string | null };

type AttributableRecipe = Pick<Recipe, 'source' | 'creatorId'> & {
  originRecipeId?: string | null;
  originCreatorId?: string | null;
  hiddenAt?: Date | null;
  hiddenReason?: RecipeHiddenReason | null;
};

/**
 * The additive attribution fields for one recipe as `viewerId` sees it.
 * Every key is OMITTED (never null) when it doesn't apply, so a user who
 * never touched Following keeps exactly the old key set (INV-8).
 *
 * - `creator`: another user's MANUAL recipe, only while Following is on for
 *   the viewer (`friendsOn`).
 * - `origin`: the viewer's own copy of someone's recipe. Once both origin
 *   columns are SetNull (the original's owner deleted their account) the copy
 *   is indistinguishable from an own recipe and carries no `origin`.
 * - `hidden`: the viewer's own auto-hidden recipe (`withHidden`).
 */
export function recipeAttribution(
  viewerId: string,
  recipe: AttributableRecipe,
  people: {
    creator?: NameParts | null | undefined;
    originCreator?: NameParts | null | undefined;
  },
  opts: { friendsOn: boolean; withHidden?: boolean },
): RecipeAttribution {
  const own = recipe.creatorId === viewerId;
  const out: RecipeAttribution = {};
  if (
    opts.friendsOn &&
    recipe.source === 'MANUAL' &&
    !own &&
    recipe.creatorId !== null &&
    people.creator
  ) {
    out.creator = {
      id: recipe.creatorId,
      displayName: displayNameOf(people.creator),
      firstName: firstNameOf(people.creator),
    };
  }
  if (own && (recipe.originRecipeId != null || recipe.originCreatorId != null)) {
    out.origin = {
      creatorFirstName:
        recipe.originCreatorId != null && people.originCreator
          ? firstNameOf(people.originCreator)
          : null,
    };
  }
  if (opts.withHidden && own && recipe.hiddenAt != null && recipe.hiddenReason != null) {
    out.hidden = { reason: recipe.hiddenReason };
  }
  return out;
}

// ─── Replace picker candidates (T-08.10, bug B-50) ─────────────────────────────
// T-08.10 (bug B-50): the Replace picker dedupes by id, drops the meal being
// replaced and narrows to the slot's meal type. The candidate rows come from
// `recipe.list({ forTable: true })`, already safety-filtered by
// `RecipeService.list` (T-01.2). The filter itself is shared with the mobile
// and web pickers, so it lives in `@chefer/utils` (`recipe-picker.ts`); the
// API re-exports it rather than keeping a second copy.
export {
  filterReplaceCandidates,
  type FilterReplaceCandidatesOptions,
  type ReplaceCandidateLike,
} from '@chefer/utils';
