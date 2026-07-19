import { z } from 'zod';
import { ingredientsService } from '../application/ingredients/ingredients.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const ingredientsRouter = router({
  /**
   * Searches the ingredient catalog (global vocabulary + own custom entries).
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(60) }))
    .query(async ({ ctx, input }) => {
      return ingredientsService.search(ctx.user.id, input.query);
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
        limit: z.number().int().min(1).max(100).default(60),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ingredientsService.list(ctx.user.id, ctx.user.role, input);
    }),

  /**
   * Updates an ingredient. Own custom rows: the creator; global rows: admins.
   */
  update: protectedProcedure
    .input(
      z.object({
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
    .input(z.object({ name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      return ingredientsService.delete(ctx.user.id, ctx.user.role, input.name);
    }),

  /**
   * Creates a private custom ingredient (manual macros, uploaded or
   * AI-generated image). Visible only to the creating user.
   */
  createCustom: protectedProcedure
    .input(
      z.object({
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
   * Computes per-serving nutrition from ingredient lines via catalog macros.
   * Returns unmatched ingredient names so the UI can show estimate coverage.
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
