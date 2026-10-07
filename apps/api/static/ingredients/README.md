# Ingredient thumbnails

Pre-rendered 256×256 webp product shots for ingredients, shipped with the API
and served by Express at `/uploads/ingredients/<file>.webp?v=<hash>`
(`apps/api/src/index.ts`; the path sits under `/uploads/*`, which Caddy already
forwards to the API, so no proxy change is needed).

Why: the shopping list and ingredient screens used on-demand Pollinations URLs.
Cold renders fail (HTTP 402 under load) or time out on phones, which left blank
thumbnails (tester feedback 2026-10-07, FB7-10). `resolveIngredientImage()`
(`apps/api/src/lib/ingredient-images`) now checks `manifest.json` first; the
cache, Unsplash and Pollinations remain the fallback for names not covered here.

## Provenance

- **AI-generated**, not photographs. Rendered once with Pollinations.ai (Flux,
  anonymous tier) from the deterministic prompt in
  `scripts/ingredient-images/prompt.ts` (`<subject>, food photography, centered
on a plain white background, studio lighting`, with `PROMPT_OVERRIDES` for
  hard subjects). The seed is derived from the ingredient key, so a re-run
  reproduces the same picture.
- The anonymous tier stamps a "pollinations.ai" logo along the bottom edge of
  the 512×512 render; the vendor script centre-crops it away (440×440) before
  downscaling to 256×256 and encoding with `cwebp -q 70`.
- `manifest.json` records, per canonical key: the file, a content hash (the
  `?v=` cache-buster), the display names that map to it, the drawn subject, the
  exact prompt, the source and the render date.

## Adding or re-rendering

Run from `apps/api` (needs `cwebp` and macOS `sips`; Chrome for the review PNGs):

```bash
cd apps/api
# new ingredients (curated recipe pool; skips files that already exist)
pnpm exec tsx ../../scripts/ingredient-images/vendor.ts --scope used
# every catalog ingredient too
pnpm exec tsx ../../scripts/ingredient-images/vendor.ts --scope all
# list what would be rendered
pnpm exec tsx ../../scripts/ingredient-images/vendor.ts --dry-run
# fix a bad picture: edit PROMPT_OVERRIDES, or just pick another seed
pnpm exec tsx ../../scripts/ingredient-images/vendor.ts --only "olive oil" --force [--reseed]
# review sheets (contact-sheet-<n>.html/.png here, gitignored)
pnpm exec tsx ../../scripts/ingredient-images/contact-sheet.ts
```

Rendering is sequential with retry/backoff: Pollinations answers 402 to a share
of requests under load, and the script simply retries. Commit the webp files
together with `manifest.json`; the API test suite fails if a manifest entry
points at a missing file.
