/**
 * recipe-image.ts
 *
 * Centralised helper for recipe image URLs.
 *
 * Current source: Unsplash CDN (stable photo IDs, no auth required).
 * Future source:  Cloudinary — run `pnpm upload:images` with your Cloudinary
 *                 credentials to migrate.  Then swap UNSPLASH_BASE for
 *                 CLOUDINARY_BASE below and update imageUrl values in DB.
 *
 * All images are served at 800 × 600 (4 : 3) for consistency across every
 * surface (card thumbnail, hero, meal-plan cell).
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

const UNSPLASH_BASE = 'https://images.unsplash.com';
const UNSPLASH_PARAMS = 'auto=format&fit=crop&w=800&h=600&q=80';

/** Fallback shown when Recipe.imageUrl is null/undefined */
export const RECIPE_FALLBACK_URL =
  `${UNSPLASH_BASE}/photo-1490645935967-10de6ba17061?${UNSPLASH_PARAMS}`;

/**
 * Tiny inline base64 LQIP (Low Quality Image Placeholder) — warm saffron tint.
 * Shown by next/image while the real image loads.
 */
export const RECIPE_BLUR_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB//EAB4QAAICAQUAAAAAAAAAAAAAAAABAgMRBAUhMf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCrM8qqNaIiijRPTaZZPXMqiAB//9k=';

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns a ready-to-use image URL for a recipe.
 * Falls back to a warm food photo if imageUrl is null/undefined.
 */
export function getRecipeImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return RECIPE_FALLBACK_URL;
  // If it's already a full URL (Unsplash or Cloudinary), return as-is.
  if (imageUrl.startsWith('http')) return imageUrl;
  // If it's a bare Cloudinary public_id, build the URL.
  const cloud = process.env['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'];
  if (cloud) {
    return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,w_800,h_600,c_fill/${imageUrl}`;
  }
  return RECIPE_FALLBACK_URL;
}

/**
 * Returns `{ src, blurDataURL, placeholder }` props ready to spread onto
 * a next/image `<Image>` component.
 */
export function getRecipeImageProps(imageUrl: string | null | undefined) {
  return {
    src: getRecipeImageUrl(imageUrl),
    blurDataURL: RECIPE_BLUR_DATA_URL,
    placeholder: 'blur' as const,
  };
}
