import { z } from 'zod';
import { ingredientCategorySchema } from '@chefer/types';
import { ingredientsService } from '../application/ingredients/ingredients.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const ingredientsRouter = router({
  /**
   * Searches the ingredient catalog (global rows + own private rows) on any
   * alias, diacritic-free. Rows carry the catalog fields (id, slug, category,
   * owner, portions, hasDensity) next to the legacy ones (plan §9).
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(60),
        category: ingredientCategorySchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ingredientsService.search(ctx.user.id, input.query, 12, {
        category: input.category,
      });
    }),

  /**
   * Resolves free-text lines to catalog rows: EXACT (slug) / ALIAS match, or
   * fuzzy CANDIDATES that are only suggestions (plan §6.1). Import review and
   * legacy-recipe edit use it.
   */
  resolve: protectedProcedure
    .input(
      z.object({
        lines: z
          .array(
            z.object({ rawName: z.string().min(1).max(200), unit: z.string().max(40).optional() }),
          )
          .min(1)
          .max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ingredientsService.resolve(ctx.user.id, input.lines);
    }),

  /**
   * Full nutrition, portions and density of catalog rows the caller may see,
   * for live preview with the shared engine in @chefer/utils (plan §9).
   */
  getMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      return ingredientsService.getMany(ctx.user.id, input.ids);
    }),

  /**
   * Canonical unit list for recipe ingredient rows.
   */
  units: protectedProcedure.query(async () => {
    return ingredientsService.getUnits();
  }),

  /**
   * Full-detail catalog listing for the Ingredients page (global + own custom).
   */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().max(60).optional(),
        mineOnly: z.boolean().optional(),
        // The page's "Load more" grows the limit in 60-item steps — the cap
        // must comfortably exceed the catalog size (a 100 cap silently broke
        // the second page: zod rejected limit=120).
        limit: z.number().int().min(1).max(1000).default(60),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ingredientsService.list(ctx.user.id, ctx.user.role, input);
    }),

  /**
   * The Ingredients page's catalog listing (plan-ingredient-catalog §10):
   * ACTIVE global rows + the caller's private rows, with source, aliases,
   * portions, full nutrition and the linked price row. Additive; `list`
   * stays for installed clients.
   */
  catalogList: protectedProcedure
    .input(
      z.object({
        search: z.string().max(60).optional(),
        category: ingredientCategorySchema.optional(),
        mineOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(60),
        offset: z.number().int().min(0).default(0),
        // tRPC infinite queries page with `cursor` (the next offset); it wins over `offset`.
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, ...rest } = input;
      return ingredientsService.catalogList(ctx.user.id, ctx.user.role, {
        ...rest,
        offset: cursor ?? rest.offset,
      });
    }),

  /**
   * Updates an ingredient. Own custom rows: the creator (nutrition included;
   * their recipes are recomputed). Global rows: admins, price and image only —
   * global nutrition comes from catalog.json (D7). `id` addresses a private
   * catalog row directly.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(40).optional(),
        // P9 (additive): a private row's category and density are editable too.
        category: ingredientCategorySchema.optional(),
        densityGPerMl: z.number().positive().max(3).nullish(),
        name: z.string().min(2).max(60),
        imageUrl: z.string().url().nullish(),
        generateAiImage: z.boolean().optional(),
        caloriesPer100g: z.number().min(0).max(900),
        proteinPer100g: z.number().min(0).max(100),
        carbsPer100g: z.number().min(0).max(100),
        fatPer100g: z.number().min(0).max(100),
        fiberPer100g: z.number().min(0).max(100).default(0),
        gramsPerPiece: z.number().positive().max(5000).nullish(),
        pricePer100gEur: z.number().min(0).max(500).nullish(),
        pricePer100mlEur: z.number().min(0).max(500).nullish(),
        pricePerPieceEur: z.number().min(0).max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ingredientsService.update(ctx.user.id, ctx.user.role, input);
    }),

  /**
   * Deletes an ingredient (own custom row, or a global row as admin).
   */
  delete: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60), id: z.string().min(1).max(40).optional() }))
    .mutation(async ({ ctx, input }) => {
      return ingredientsService.delete(ctx.user.id, ctx.user.role, input.name, input.id);
    }),

  /**
   * Creates a private custom ingredient (manual macros, uploaded or
   * AI-generated image). Visible only to the creating user. CONFLICT when the
   * catalog already has it, unless `confirmDifferent` (plan §8.1).
   */
  createCustom: protectedProcedure
    .input(
      z.object({
        confirmDifferent: z.boolean().optional(),
        category: ingredientCategorySchema.optional(),
        densityGPerMl: z.number().positive().max(3).nullish(),
        name: z.string().min(2).max(60),
        imageUrl: z.string().url().nullish(),
        generateAiImage: z.boolean().optional(),
        caloriesPer100g: z.number().min(0).max(900),
        proteinPer100g: z.number().min(0).max(100),
        carbsPer100g: z.number().min(0).max(100),
        fatPer100g: z.number().min(0).max(100),
        fiberPer100g: z.number().min(0).max(100).default(0),
        gramsPerPiece: z.number().positive().max(5000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ingredientsService.createCustom(ctx.user.id, input);
    }),

  /**
   * Estimates per-100g nutrition for one ingredient name (catalog first, AI
   * fallback) — powers the "Auto-fill" button on the ingredient form.
   */
  estimateNutrition: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(60) }))
    .mutation(async ({ ctx, input }) => {
      return ingredientsService.estimateNutrition(ctx.user, input.name);
    }),

  /**
   * Computes per-serving nutrition with the shared engine over catalog rows. A
   * line may carry the `ingredientId` it was picked as; otherwise its name is
   * resolved (EXACT/ALIAS). Unresolved lines are returned in `unmatched` and
   * make `status` PARTIAL — nothing is estimated (plan §5, §9).
   */
  computeNutrition: protectedProcedure
    .input(
      z.object({
        ingredients: z
          .array(
            z.object({
              name: z.string().min(1),
              quantity: z.number().positive(),
              unit: z.string().min(1),
              ingredientId: z.string().min(1).max(40).optional(),
              optional: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(50),
        servings: z.number().int().min(1).max(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ingredientsService.computeNutrition(ctx.user.id, input.ingredients, input.servings);
    }),
});
