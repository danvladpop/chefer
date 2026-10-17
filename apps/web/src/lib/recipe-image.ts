/**
 * recipe-image.ts
 *
 * Centralised helper for recipe image URLs and next/image props.
 *
 * A recipe may have no photo yet (F3: new recipes wait in PENDING until the
 * server generates one) — the helpers return `null` for that case, so every
 * caller must render a placeholder (`RecipeThumbnail` /
 * `RecipeImagePlaceholder`) instead of an unrelated stock photo.
 */

/**
 * Tiny inline base64 LQIP (Low Quality Image Placeholder) — warm saffron tint.
 * Shown by next/image while the real image loads.
 */
export const RECIPE_BLUR_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB//EAB4QAAICAQUAAAAAAAAAAAAAAAABAgMRBAUhMf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCrM8qqNaIiijRPTaZZPXMqiAB//9k=';

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns a ready-to-use image URL for a recipe, or `null` when it has no
 * photo (null/empty, or a bare Cloudinary public_id with no cloud configured).
 */
export function getRecipeImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  // If it's already a full URL (Unsplash or Cloudinary), return as-is.
  if (imageUrl.startsWith('http')) return imageUrl;
  // If it's a bare Cloudinary public_id, build the URL.
  const cloud = process.env['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'];
  if (cloud) {
    return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,w_800,h_600,c_fill/${imageUrl}`;
  }
  return null;
}

/**
 * Hosts registered in next.config.ts `images.remotePatterns`. Anything else
 * (imported recipes keep their page's og:image — F5, any domain) must render
 * `unoptimized`, or next/image's dev-mode loader throws "unconfigured host"
 * and takes the whole page down with it. Production is already unoptimized
 * globally, so this only changes dev behavior.
 */
const OPTIMIZED_HOSTS = new Set([
  'avatars.githubusercontent.com',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
  'res.cloudinary.com',
  'image.pollinations.ai',
]);

function isOptimizedHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export type RecipePhotoProps = {
  src: string;
  blurDataURL: string;
  placeholder: 'blur';
  unoptimized?: true;
};

/**
 * Returns `{ src, blurDataURL, placeholder }` props ready to spread onto
 * a next/image `<Image>` component, or `null` when the recipe has no photo.
 * External hosts outside the configured allowlist get `unoptimized` so they
 * render instead of throwing.
 */
export function getRecipeImageProps(imageUrl: string | null | undefined): RecipePhotoProps | null {
  const src = getRecipeImageUrl(imageUrl);
  if (src === null) return null;
  return {
    src,
    blurDataURL: RECIPE_BLUR_DATA_URL,
    placeholder: 'blur',
    ...(isOptimizedHost(src) ? {} : { unoptimized: true }),
  };
}
