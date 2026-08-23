import { z } from 'zod';
import { recipeImportService } from '../application/recipe-import/recipe-import.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Recipe import (F5 Cheferize) ────────────────────────────────────────────
// Merged into the `recipe` namespace (routers/index.ts mergeRouters), so the
// public procedures are `recipe.importPreview` / `recipe.importSave`.
//
// importPreview is PROTECTED, not premium: the free tier gets one extraction
// preview a day (the §6.4 ghost state) — the quota inside the service
// enforces `recipeImportsPerDay` (free 1 / premium 5). importSave is premium.

// ~5.4 MB of base64 ≈ a 4 MB image; express.json caps bodies at 10 MB.
const MAX_IMAGE_BASE64_CHARS = 5_600_000;

const importSourceSchema = z
  .object({
    url: z.string().trim().url().max(2048).optional(),
    text: z.string().trim().min(20).max(30_000).optional(),
    imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS).optional(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  })
  .refine((source) => [source.url, source.text, source.imageBase64].filter(Boolean).length === 1, {
    message: 'Provide exactly one of url, text or imageBase64.',
  });

const extractedRecipeSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        quantity: z.number().positive(),
        unit: z.string().min(1).max(20),
      }),
    )
    .min(1)
    .max(40),
  instructions: z.array(z.string().min(1).max(500)).min(1).max(30),
  nutritionInfo: z.object({
    calories: z.number().min(0),
    protein: z.number().min(0),
    carbs: z.number().min(0),
    fat: z.number().min(0),
    fiber: z.number().min(0),
  }),
  cuisineType: z.string().min(1).max(60),
  dietaryTags: z.array(z.string().max(30)).max(10),
  prepTimeMins: z.number().int().min(0),
  cookTimeMins: z.number().int().min(0),
  servings: z.number().int().min(1).max(20),
});

export const importRouter = router({
  /**
   * Extract + Cheferize preview from a URL, pasted text, or photo.
   * Metered via `recipeImportsPerDay` (free 1/day — the ghost state).
   */
  importPreview: protectedProcedure.input(importSourceSchema).mutation(async ({ ctx, input }) => {
    // exactOptionalPropertyTypes: only pass the fields that are actually set.
    return recipeImportService.preview(ctx.user, {
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {}),
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    });
  }),

  /**
   * Saves the imported recipe (original or Cheferized) into the user's
   * collection. Adapted variants are re-validated server-side against the
   * P1-2 allergen matcher — fail closed.
   */
  importSave: premiumProcedure
    .input(
      z.object({
        recipe: extractedRecipeSchema,
        variant: z.enum(['original', 'adapted']),
        sourceUrl: z.string().url().max(2048).nullish(),
        ogImageUrl: z.string().url().max(2048).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recipeImportService.save(ctx.user, input);
    }),
});
