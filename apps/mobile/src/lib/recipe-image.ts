import { getApiBaseUrl } from './api-url';

// Mirror of apps/web/src/lib/recipe-image.ts, minus the next/image props.

/** Recipe.imageStatus (Prisma `ImageStatus`). */
export type RecipeImageStatus = 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';

/**
 * Returns a ready-to-use image URL for a recipe, or null when there is no
 * photo to show. Absolute URLs pass through; API-relative paths
 * (`/uploads/...`) are resolved against the API host.
 *
 * F3 (2026-10-17): there is no stock-photo fallback. A recipe waiting for its
 * generated image used to show an unrelated Unsplash dish; callers now render
 * a placeholder (`RecipeImage`, or `MediaFrame`'s illustration) for null.
 */
export function getRecipeImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    return `${getApiBaseUrl()}${imageUrl}`;
  }
  return null;
}

/** The server is still making this recipe's photo (F3: it waits PENDING). */
export function isPreparing(imageStatus: RecipeImageStatus | null | undefined): boolean {
  return imageStatus === 'PENDING' || imageStatus === 'GENERATING';
}

/**
 * What a recipe image area shows. A photo wins whenever there is one, so a
 * recipe whose image is being regenerated keeps its old photo meanwhile.
 * Without a photo, the status says whether one is on its way; without a
 * status (DTOs that don't carry it) the placeholder makes no claim.
 */
export type RecipeImageView =
  | { kind: 'photo'; uri: string }
  | { kind: 'preparing' }
  | { kind: 'unavailable' }
  | { kind: 'none' };

export function resolveRecipeImage(
  imageUrl: string | null | undefined,
  imageStatus?: RecipeImageStatus | null,
): RecipeImageView {
  const uri = getRecipeImageUrl(imageUrl);
  if (uri) return { kind: 'photo', uri };
  if (isPreparing(imageStatus)) return { kind: 'preparing' };
  if (imageStatus === 'FAILED' || imageStatus === 'DONE') return { kind: 'unavailable' };
  return { kind: 'none' };
}
