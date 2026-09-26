// Shared share-card copy (root metadata, OpenGraph/Twitter images). Audit
// F-PUB-1-1 / F-X-1-2: links used to preview as "A production-ready
// TypeScript monorepo starter." with no image.

export const SITE_NAME = 'Chefer';
export const SITE_TAGLINE = 'Your week of meals, planned around you';
export const SITE_DESCRIPTION =
  'Chefer plans a week of meals around your goals and allergies, prices the shopping list before you shop, tracks what you eat, and plans your gym training too.';

/** Public, indexable routes (everything else sits behind sign-in). */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/support',
] as const;
