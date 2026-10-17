# S3 · F3 recipe hero "distorted": evidence

**Root cause: the generated image itself (hypothesis c).** The apps crop the photo correctly on both
platforms; nothing is stretched. The owner's hero is the free **Pollinations fallback** image: 512×384,
produced by a low-quality model, with a lopsided bowl rim and smeared food. It is upscaled about 2.4×
(Pro Max hero, 408×224 pt at 3×), which makes it look soft. That fix belongs in image generation, not
in the hero.

## How it was proven

1. **Renderer (a, d ruled out).** A geometric test pattern (circles on a grid, plus a blue centre
   crosshair) was served as a recipe image and opened in the recipe detail of the dev build. A script
   then measured the centre circle in the device screenshot:

   | Device                     | Source | Horizontal ⌀ | Vertical ⌀ | Ratio |
   | -------------------------- | ------ | ------------ | ---------- | ----- |
   | iPhone 17 Pro (iOS 26.5)   | 1:1    | 218 px       | 218 px     | 1.000 |
   | Pixel_8 emulator (Android) | 1:1    | 195 px       | 195 px     | 1.000 |

   The circles stay round, and the red frame is cut at the top and bottom. So `resizeMode="cover"`
   crops on both platforms, and the NativeWind `className` doesn't interfere. See
   `s3-ios-17pro-test-pattern-1x1.png` and `s3-android-pixel8-test-pattern-1x1.png`.

2. **The owner's exact source.** Pollinations URLs are deterministic (the seed is the name plus the
   cuisine, `recipeImageFallbackUrl`). Rebuilding the URL for "Crispy Beef ’n’ Baby Broccoli Stir Fry"
   / Asian returned `200`, `x-cache: HIT`, 512×384. It is the image the owner's phone loaded, saved as
   `s3-source-pollinations-512x384.jpg`. The bowl's warped rim and the smeared toppings are already in
   the source pixels.
3. **Same recipe on both devices.** That URL was put on a recipe in the S3 DB clone and opened on
   both devices: `s3-ios-17pro-owner-image.png` and `s3-android-pixel8-owner-image.png`. Both match the
   owner's `04-recipe-hero-distorted.png` composition: the same centre crop, and the watermark falls
   outside the frame.
4. **How common it is in prod.** The 2026-10-17 03:00 backup has 514 recipes on
   `image.pollinations.ai` and 74 on our own `/uploads/recipes` (Cloudflare flux-1-schnell). A sample
   of 8 Cloudflare images were all **1024×1024** (square, not 4:3) and clean, for example
   `s3-source-cloudflare-flux-1024-sample.jpg`. A sample of 6 Pollinations images were all 512×384,
   with the same low-quality look.

## Not the cause, but worth knowing

- **Container aspect (b).** The hero is 224 pt tall on phones: 1.61:1 at 393 pt wide, 1.82:1 on a Pro
  Max. That crops 17–27% of a 4:3 source and 38–45% of a square Cloudflare source. This is cropping,
  not distortion. Changing the hero's shape is a design call. A 4:3 frame would also show the
  Pollinations watermark (bottom right).
- **Web** (`recipes/[id]/page.tsx` → `RecipeImage.tsx`) renders an `<img>` with `object-cover`. The
  rendering is correct; only the source is the problem.
- The brief's "sources are 4:3 / Cloudinary 800×600" applies to Imagen and Cloudinary only. Prod
  runs `IMAGE_PROVIDER=cloudflare` with local storage, which keeps the raw 1024×1024 output.

## Suggested fix (generation; owner decision, not done here)

Replace the Pollinations images: regenerate the 514 Pollinations-backed recipes with Cloudflare flux
inside the daily neuron budget (about 35 images a day). Stop serving the Pollinations fallback for new
recipes and show the placeholder instead. The S3 brief rules out regenerating or touching prod images,
so this needs its own task.

## Regression guard

`apps/mobile/tests/unit/recipe-image-cover.test.tsx` asserts that `RecipeImage` keeps
`resizeMode="cover"` for both the hero and card sizes, and that a caller's style can't override the
fit. It goes red when `resizeMode` is switched to `"stretch"` (checked).
