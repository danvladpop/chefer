/**
 * Pollinations.ai image generation — free, no API key, CDN-cached.
 * URL format: https://image.pollinations.ai/prompt/{encoded}?seed=N&width=W&height=H&nologo=true
 *
 * The seed is derived from the recipeId so the same recipe always gets the same image.
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

export function buildPollinationsUrl(
  prompt: string,
  recipeId: string,
  width = 800,
  height = 600,
): string {
  const encoded = encodeURIComponent(prompt);
  const seed = strToSeed(recipeId);
  return `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&width=${width}&height=${height}&nologo=true&model=flux`;
}
