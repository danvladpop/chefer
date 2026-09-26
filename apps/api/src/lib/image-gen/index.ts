import { env } from '../env.js';
import { uploadRecipeImage } from '../image-cdn/cloudinary.js';
import { CloudflareImageService } from './cloudflare.js';
import { ImagenRateLimitError } from './imagen.js';
import { buildPollinationsUrl } from './pollinations.js';
import { buildRecipeImagePrompt } from './prompt.js';
import type { IRecipeImageService, RecipeImageInput } from './types.js';

// Re-export error classes so callers don't need to know where they come from.
// The worker references these types — keep them even if Imagen is no longer used.
export { ImagenRateLimitError, ImagenContentFilterError } from './imagen.js';
export { CloudflareImageService } from './cloudflare.js';

export type { IRecipeImageService, RecipeImageInput } from './types.js';

/** How long to wait for Pollinations to generate and return the image. */
const POLLINATIONS_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Builds a Pollinations.ai image URL and pre-warms it by fetching the URL.
 * Pollinations generates the image on first request (10–30 s); subsequent
 * requests hit their CDN cache instantly.  We wait here so the worker only
 * marks the recipe DONE once the image is truly available — keeping the
 * shimmer visible in the UI until generation is complete.
 */
async function generatePollinationsImage(input: RecipeImageInput): Promise<string> {
  const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType);
  const url = buildPollinationsUrl(prompt, input.recipeName, input.cuisineType);

  console.log(`[image-gen] warming Pollinations URL for ${input.recipeId}…`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      // Pollinations' anonymous tier rejects concurrent/rapid generation
      // requests. Signal a rate-limit so the worker backs off WITHOUT
      // burning the recipe's retry budget.
      const retryAfterHeader = Number(res.headers.get('retry-after'));
      const retryAfterMs =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 15_000;
      await res.arrayBuffer().catch(() => undefined); // drain
      throw new ImagenRateLimitError(retryAfterMs);
    }
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

// ─── Recipe image providers (audit P0-5 groundwork) ───────────────────────────
// Every image model sits behind IRecipeImageService, picked by IMAGE_PROVIDER:
//   pollinations (default) — the anonymous URL above; nothing to upload.
//   cloudflare             — Workers AI text-to-image (CF_IMAGE_MODEL,
//                            flux-1-schnell by default); the returned bytes
//                            go to Cloudinary under the recipe id.
// The worker only calls generateAndUploadRecipeImage, so switching provider
// is an env change and a restart.

class PollinationsImageService implements IRecipeImageService {
  readonly name = 'pollinations';
  generate(input: RecipeImageInput): Promise<string> {
    return generatePollinationsImage(input);
  }
}

let service: IRecipeImageService | null = null;

/** The configured provider (lazy, so importing this module never needs env). */
export function getRecipeImageService(): IRecipeImageService {
  if (service) return service;
  if (env.IMAGE_PROVIDER === 'cloudflare') {
    if (!env.CLOUDINARY_CLOUD_NAME) {
      console.warn(
        '[image-gen] IMAGE_PROVIDER=cloudflare without Cloudinary — images are stored as data URLs',
      );
    }
    service = new CloudflareImageService({
      accountId: env.CF_ACCOUNT_ID!,
      apiToken: env.CF_API_TOKEN!,
      model: env.CF_IMAGE_MODEL,
      upload: uploadRecipeImage,
    });
  } else {
    service = new PollinationsImageService();
  }
  console.info(`[image-gen] recipe images via ${service.name}`);
  return service;
}

/** Generates (and, where needed, uploads) a recipe image; returns its URL. */
export function generateAndUploadRecipeImage(input: RecipeImageInput): Promise<string> {
  return getRecipeImageService().generate(input);
}
