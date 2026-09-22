import { getApiBaseUrl } from './api-url';

// Mirror of apps/web/src/lib/recipe-image.ts, minus the next/image props.

const UNSPLASH_BASE = 'https://images.unsplash.com';
const UNSPLASH_PARAMS = 'auto=format&fit=crop&w=800&h=600&q=80';

/** Fallback shown when Recipe.imageUrl is null/undefined. */
export const RECIPE_FALLBACK_URL = `${UNSPLASH_BASE}/photo-1490645935967-10de6ba17061?${UNSPLASH_PARAMS}`;

/**
 * Returns a ready-to-use image URL for a recipe. Absolute URLs pass through;
 * API-relative paths (`/uploads/...`) are resolved against the API host;
 * anything else falls back to the shared placeholder photo.
 */
export function getRecipeImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) {
    return RECIPE_FALLBACK_URL;
  }
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    return `${getApiBaseUrl()}${imageUrl}`;
  }
  return RECIPE_FALLBACK_URL;
}
