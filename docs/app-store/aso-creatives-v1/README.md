# Store creatives v1 (captioned screenshots + Play feature graphic)

First captioned screenshot set for Chefer, built from `docs/app-store/aso-plan.md` §4.1 (screenshots), §4.3 (feature graphic) and §4.4 (gym Custom Product Page). Food leads; gym is the second pillar (frames 6–7, brown background).

Everything here is rendered from the Remotion project in [`marketing/chefer-ad`](../../../marketing/chefer-ad). Don't edit the PNGs by hand: change the source and re-render.

**Nothing has been uploaded.** The owner uploads to App Store Connect and Play Console.

## What's here

| Folder                              | Size      | Use                                                                                    |
| ----------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `play/1320x2640/`                   | 1320×2640 | Play phone screenshots, 8 frames                                                       |
| `play/feature-graphic-1024x500.png` | 1024×500  | Play feature graphic                                                                   |
| `ios/1320x2868/`                    | 1320×2868 | App Store 6.9" set, 8 frames                                                           |
| `ios/1206x2622/`                    | 1206×2622 | App Store 6.3" set (the size ASC accepted for 1.0.1), rendered natively, not resampled |
| `ios-cpp-gym/1320x2868/`            | 1320×2868 | iOS Custom Product Page "Gym log": frames 6, 7, routine, 1, 3                          |
| `ios-cpp-gym/1206x2622/`            | 1206×2622 | Same, 6.3"                                                                             |

All PNGs are 24-bit RGB with no alpha channel, which both stores require.

**Play size:** Play allows at most 2:1 between the long and short side, so the set is 1320×2640 (exactly 2:1). 1080×2340 from the plan is 2.17:1 and would be rejected.

## Frames (default order, both stores)

| #   | File                      | Caption                                      | Screen (raw capture)                           |
| --- | ------------------------- | -------------------------------------------- | ---------------------------------------------- |
| 1   | `01-ai-meal-plan`         | A week of meals, planned by AI               | Plan tab                                       |
| 2   | `02-allergy-checked`      | Checked for every allergy at your table      | Plan tab + magnified "Checked for your table"  |
| 3   | `03-grocery-list`         | One grocery list for the whole week          | Shop tab                                       |
| 4   | `04-cook-mode`            | Cook step by step, hands free                | Cook mode                                      |
| 5   | `05-calories-macros`      | Hit your calories and macros                 | Today                                          |
| 6   | `06-progressive-overload` | A gym log that tells you what to lift next   | Workout summary + magnified "Next time" advice |
| 7   | `07-gym-floor`            | Built for the gym floor: offline, rest timer | Active workout with rest timer                 |
| 8   | `08-privacy`              | No ads. Your data stays yours.               | Collage: Shop, Plan, workout summary           |

The gym CPP adds one frame that isn't in §4.1: **"Every lift shows your next target"** on the Routine screen. That caption is a draft from this pass and needs owner review.

## Needs a fresh capture

The raw captures are the 1.0.1 ones (`docs/app-store/screenshots-1.0.1`, `docs/app-store/play-1.0.1/phone-screenshots`). These frames are placeholders until a new capture lands:

| Frame                                  | What to capture                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2 – household / allergy                | Plan tab for a household of 2–3 people with different allergies, so "Checked for your table" names more than one person. Today it reads "Checked for Peanuts (you)" and frames 1 and 2 show the same screen. |
| 4 – cook mode                          | A cook step with a running timer and an ingredient list or photo. The current capture leaves the lower half of the screen empty.                                                                             |
| 8 – privacy                            | More → Profile → Privacy & data, if the owner wants a real screen instead of the collage.                                                                                                                    |
| 5 – calories and macros (nice to have) | Today scrolled to the calorie and macro rings. The current capture opens on tomorrow's breakfast.                                                                                                            |

Use the Maestro recipe from §4.1 (Release simulator build from a worktree, demo account `sam.demo@chefer.test`) and a demo week with food photos on every card and no empty states.

## Copy to check before upload

- **"hands free" (frame 4).** Cook mode keeps the screen awake and uses large step text, but there's no voice control. A reviewer or user could read "hands free" as voice. A safer alternative is "Cook step by step, screen stays on".
- Frame 8's subline ("Export it or delete your account from the app at any time.") matches the existing iOS description (`docs/app-store/ios/metadata.md`).

## Re-render

```bash
cd marketing/chefer-ad
npm ci                                   # first time only
node scripts/render-store.mjs            # all 35 stills, about 2 minutes
node scripts/render-store.mjs play--     # only ids starting with play--
node scripts/render-store.mjs ios--1320x2868--04 ios--1206x2622--04   # one frame, both iOS sizes
```

The script bundles once, renders each `Store/*` composition with `npx remotion still`, then rewrites every PNG as 24-bit RGB with Remotion's bundled ffmpeg. Output paths follow the composition id: `<set>--<w>x<h>--<NN>-<slug>` becomes `<set>/<w>x<h>/<NN>-<slug>.png`.

To preview or tweak one frame live, run `npm run dev` and open the **Store** folder in Remotion Studio.

### Where to change things

| Change                                       | Where                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caption, subline, tone, screen, callout crop | `FRAMES` in `marketing/chefer-ad/src/store/frames.ts`. Wrap words in `*…*` to colour them.                                                                          |
| Frame order, which sets exist, sizes         | `SETS` and `SIZES` in the same file                                                                                                                                 |
| New raw capture                              | Replace `public/store/ios/<screen>.jpg` (1320×2868, with status bar) and `public/store/play/<screen>.jpg` (1320×2640, cropped below the status bar), then re-render |
| Layout, colours, device frame                | `src/store/Screenshot.tsx`, `src/store/StoreDevice.tsx`                                                                                                             |
| Feature graphic copy                         | `lines` prop of `play--feature-graphic-1024x500` in `src/store/StoreCompositions.tsx`                                                                               |

Callout crops are fractions of the raw capture (`x`, `y`, `w`, `h`), set separately for the iOS and Play captures because the Play ones are cropped below the status bar. Check them again after a recapture.
