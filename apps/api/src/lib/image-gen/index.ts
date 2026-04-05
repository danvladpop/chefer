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

/** How long to wait for Pollinations to generate and return the image. */
const POLLINATIONS_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Builds a Pollinations.ai image URL and pre-warms it by fetching the URL.
 * Pollinations generates the image on first request (10–30 s); subsequent
 * requests hit their CDN cache instantly.  We wait here so the worker only
 * marks the recipe DONE once the image is truly available — keeping the
 * shimmer visible in the UI until generation is complete.
 */
export async function generateAndUploadRecipeImage(input: RecipeImageInput): Promise<string> {
  const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType, input.description);
  const url = buildPollinationsUrl(prompt, input.recipeId);

  console.log(`[image-gen] warming Pollinations URL for ${input.recipeId}…`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Pollinations returned ${res.status} for recipe ${input.recipeId}`);
    }
    // Drain body so the connection is properly released
    await res.arrayBuffer();
    console.log(`[image-gen] Pollinations ready for ${input.recipeId}`);
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error(
        `Pollinations timed out after ${POLLINATIONS_TIMEOUT_MS / 1000}s for recipe ${input.recipeId}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  return url;
}
