/**
 * Pollinations.ai image generation — free, no API key, CDN-cached.
 * URL format: https://image.pollinations.ai/prompt/{encoded}?seed=N&width=W&height=H&nologo=true
 *
 * The seed is derived from the recipe's *content* (normalised name + cuisine),
 * NOT from the recipe ID. Regenerating a plan produces fresh LLM-invented IDs,
 * but the same dish must map to the same URL so Pollinations' CDN cache turns
 * repeat generations into instant hits. The prompt is built from the same
 * stable fields (see prompt.ts) for the same reason.
 *
 * The URL is served with Cache-Control: immutable so browsers won't re-fetch it.
 */

/** Deterministic numeric seed from a string (djb2 hash) */
function strToSeed(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  }
  return Math.abs(hash) % 2_147_483_647; // keep positive, within int32 range
}

/** Normalises a recipe name/cuisine for stable hashing across regenerations. */
export function normalizeForSeed(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

// 512×384 keeps the 4:3 ratio while generating ~2.4× fewer pixels than the old
// 800×600 — Flux generation time scales with pixel count, and meal cards render
// at ~200 px wide anyway.
export function buildPollinationsUrl(
  prompt: string,
  recipeName: string,
  cuisineType: string,
  width = 512,
  height = 384,
): string {
  const encoded = encodeURIComponent(prompt);
  const seed = strToSeed(`${normalizeForSeed(recipeName)}|${normalizeForSeed(cuisineType)}`);
  return `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&width=${width}&height=${height}&nologo=true&model=flux`;
}
