import { buildPollinationsUrl } from './pollinations.js';
import { buildRecipeImagePrompt } from './prompt.js';

// Re-export error classes so callers don't need to know where they come from.
// The worker references these types — keep them even if Imagen is no longer used.
export { ImagenRateLimitError, ImagenContentFilterError } from './imagen.js';

export interface RecipeImageInput {
  recipeId: string;
  recipeName: string;
  cuisineType: string;
  description: string;
}

/**
 * Builds a stable, CDN-cached Pollinations.ai image URL for the recipe.
 * No API call is made here — the URL is deterministic and the image is
 * generated/cached by Pollinations on first browser request.
 * Returns the URL immediately so the worker can mark the recipe DONE fast.
 */
export async function generateAndUploadRecipeImage(input: RecipeImageInput): Promise<string> {
  const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType, input.description);
  return buildPollinationsUrl(prompt, input.recipeId);
}
