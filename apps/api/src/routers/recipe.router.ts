import { z } from 'zod';
import { recipeNutritionSourceSchema } from '@chefer/types';
import { recipeService } from '../application/recipe/recipe.service.js';
import { buildPollinationsUrl } from '../lib/image-gen/pollinations.js';
import { buildRecipeImagePrompt } from '../lib/image-gen/prompt.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// T-40.3 (D-19): the recipe minimum is a name + at least one ingredient line
// with a name and an amount > 0 — description/instructions/cuisineType are
// no longer required, servings defaults to 1. This is a WIDENING: old
// clients keep sending everything they send today and keep working
// (`min(1)` never gets ADDED to a previously-optional field, and none of
// these previously-required fields becomes stricter).
const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});
const recipeNutritionInfoSchema = z.object({
  calories: z.number().int().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  // D-18: fiber is still STORED (an old client keeps sending it on create,
  // and an edit must keep sending the stored value back) but the manual
  // form never shows a fiber input on either platform any more.
  fiber: z.number().min(0).default(0),
  source: recipeNutritionSourceSchema.optional(),
});

export const recipeRouter = router({
  /**
   * Deterministic AI-generated image URL for a recipe (Pollinations — the
   * image is generated on first fetch and CDN-cached; same name+cuisine
   * always maps to the same URL). Used by the create-recipe form's
   * "Generate with AI" option.
   */
  aiImageUrl: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(120), cuisineType: z.string().max(60) }))
    .query(async ({ input }) => {
      const cuisine = input.cuisineType || 'international';
      return {
        url: buildPollinationsUrl(buildRecipeImagePrompt(input.name, cuisine), input.name, cuisine),
      };
    }),

  /**
   * Returns all recipes for the user (from their meal plan history).
   * When savedOnly=true, returns only favourited recipes.
   * When myRecipesOnly=true, returns only the user's manually created recipes.
   */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        savedOnly: z.boolean().optional(),
        myRecipesOnly: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        /**
         * T-00.11 (B-34/B-46): drop recipes unsafe for the user's/household's
         * allergies and dietary restrictions. Optional — old clients that omit
         * it keep today's unfiltered list.
         */
        forTable: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.list(ctx.user.id, input);
    }),

  /**
   * Cookbook → Discover (F-REC-1-4): browse the curated recipe pool, already
   * filtered by the user's and household's allergies and restrictions. Every
   * tier, no AI. Additive.
   */
  discover: protectedProcedure
    .input(
      z.object({
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
        search: z.string().max(100).optional(),
        maxTotalMins: z.number().int().min(5).max(600).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.discover(ctx.user.id, input);
    }),

  /**
   * Returns a single manual recipe owned by the authenticated user.
   * Used to pre-fill the edit form.
   */
  getMyRecipe: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return recipeService.getMyRecipe(ctx.user.id, input.recipeId);
    }),

  /**
   * Creates a new manual recipe owned by the authenticated user.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        // T-40.3 (D-19): description/cuisineType default to empty — a name +
        // one ingredient line with an amount is the whole minimum.
        description: z.string().max(500).default(''),
        // D-19: at least one ingredient LINE with a name and an amount > 0.
        ingredients: z.array(recipeIngredientSchema).min(1),
        // T-40.4: steps are optional now (a recipe can be "no steps yet").
        instructions: z.array(z.string().min(1)).default([]),
        nutritionInfo: recipeNutritionInfoSchema.default({
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
        }),
        cuisineType: z.string().max(60).default(''),
        dietaryTags: z.array(z.string()).default([]),
        prepTimeMins: z.number().int().min(0).default(0),
        cookTimeMins: z.number().int().min(0).default(0),
        servings: z.number().int().min(1).default(1),
        imageUrl: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recipeService.create(ctx.user.id, {
        ...input,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- '' from a cleared form field must also become null
        imageUrl: input.imageUrl || null,
      });
    }),

  /**
   * Updates an existing manual recipe owned by the authenticated user.
   */
  update: protectedProcedure
    .input(
      z.object({
        recipeId: z.string().min(1),
        name: z.string().min(1).max(120),
        description: z.string().max(500).default(''),
        ingredients: z.array(recipeIngredientSchema).min(1),
        instructions: z.array(z.string().min(1)).default([]),
        nutritionInfo: recipeNutritionInfoSchema.default({
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
        }),
        cuisineType: z.string().max(60).default(''),
        // T-01.6 (bug B-01): `[]` is included on every input so it's always
        // present; the level-0-mobile-empty-tags guard below decides whether
        // to actually apply it.
        dietaryTags: z.array(z.string()).default([]),
        prepTimeMins: z.number().int().min(0).default(0),
        cookTimeMins: z.number().int().min(0).default(0),
        servings: z.number().int().min(1).default(1),
        imageUrl: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { recipeId, imageUrl, dietaryTags, ...data } = input;
      // T-01.6 (bug B-01): installed mobile apps below api-level 2 (no
      // header, or the wave-0 JS at level 1) hard-code `dietaryTags: []` on
      // every save — that used to silently strip a saved recipe's tags. Such
      // an update with an EMPTY tags array keeps whatever tags are already
      // stored instead of overwriting them; web and wave-1+ mobile builds
      // are trusted to mean it when they send `[]`.
      const isLegacyMobileEmptyTags =
        ctx.isMobileClient && ctx.clientApiLevel < 2 && dietaryTags.length === 0;
      return recipeService.update(ctx.user.id, recipeId, {
        ...data,
        ...(isLegacyMobileEmptyTags ? {} : { dietaryTags }),
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- '' from a cleared form field must also become null
        imageUrl: imageUrl || null,
      });
    }),

  /**
   * Checks whether a recipe is saved by the current user.
   */
  isSaved: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Includes the pin state so the recipe page can render the
      // "use in next plan" toggle (P1-1's producer side).
      return recipeService.getFavouriteState(ctx.user.id, input.recipeId);
    }),

  /**
   * Toggles a recipe in the user's favourites. Returns the new saved state.
   */
  toggleFavourite: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return recipeService.toggleFavourite(ctx.user.id, input.recipeId);
    }),

  /**
   * Toggles whether a saved recipe should be included as a hint in the
   * next AI meal plan generation.
   */
  toggleUseInNextPlan: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1), useInNextPlan: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return recipeService.toggleUseInNextPlan(ctx.user.id, input.recipeId, input.useInNextPlan);
    }),

  rate: protectedProcedure
    .input(
      z.object({
        recipeId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recipeService.rate(ctx.user.id, input.recipeId, input.rating, input.notes);
    }),

  getMyRating: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return recipeService.getMyRating(ctx.user.id, input.recipeId);
    }),

  /**
   * T-02.3: the detail-surface `CheckedForLine` payload for a recipe.
   * Additive and separate from `mealPlan.getRecipe` (`safetyChecks: null`
   * when the table has nothing to check) — see the recipe.service.ts
   * doc comment for why this is its own query.
   */
  getSafetyChecks: protectedProcedure
    .input(z.object({ recipeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return recipeService.getSafetyChecks(ctx.user.id, input.recipeId);
    }),

  /**
   * T-02.5/T-01.4: the `FilteredForLine` count + active rule labels for
   * Discover. A separate query from `discover` so an old client that only
   * calls `discover` is unaffected.
   */
  discoverHiddenCount: protectedProcedure
    .input(
      z.object({
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
        search: z.string().max(100).optional(),
        maxTotalMins: z.number().int().min(5).max(600).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.discoverHiddenCount(ctx.user.id, input);
    }),

  /**
   * T-02.5 (rev 2, L-SAFE2): the Replace picker's `Filtered for …` footer —
   * how many `list({ forTable: true })` results the safety filter removed,
   * mirroring `discoverHiddenCount`. A separate query so an old client that
   * only calls `list` is unaffected.
   */
  listHiddenCount: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        savedOnly: z.boolean().optional(),
        myRecipesOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return recipeService.listHiddenCount(ctx.user.id, input);
    }),
});
