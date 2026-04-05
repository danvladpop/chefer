import { generateRecipeImage } from './imagen.js';
import { buildRecipeImagePrompt } from './prompt.js';
import { uploadRecipeImage } from '../image-cdn/cloudinary.js';

export { ImagenRateLimitError, ImagenContentFilterError } from './imagen.js';

export interface RecipeImageInput {
  recipeId: string;
  recipeName: string;
  cuisineType: string;
  description: string;
}

/**
 * Full pipeline: generate → upload → return CDN URL.
 * Does not catch errors — the worker is responsible for classifying failures.
 */
export async function generateAndUploadRecipeImage(input: RecipeImageInput): Promise<string> {
  const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType, input.description);
  const { base64, mimeType } = await generateRecipeImage(prompt);
  return uploadRecipeImage(base64, mimeType, input.recipeId);
}
