# Chefer ad — "Biscuit"

A 24-second animated app ad made with [Remotion](https://remotion.dev). Biscuit the corgi goes from couch loaf to PR, using Chefer's meal plans, shopping list, scan + check-off and workouts.

This is a standalone npm project. It is deliberately **outside** the pnpm workspace, so turbo lint/typecheck/test never touch it.

```bash
npm i
npm run dev                                            # Remotion Studio
npx remotion render CheferAd out/chefer-ad.mp4         # 1080×1920
npx remotion render CheferAdLandscape out/chefer-ad-landscape.mp4   # 1920×1080
```

From the repo root, the `chefer-ad-studio` entry in `.claude/launch.json` starts Studio on port 3123.

## Compositions

| Id                       | Size      | Frames | Notes                                          |
| ------------------------ | --------- | ------ | ---------------------------------------------- |
| `CheferAd`               | 1080×1920 | 720    | Main vertical cut                              |
| `CheferAdLandscape`      | 1920×1080 | 720    | Same scenes; headline left, stage scaled right |
| `CheferAd-Scenes/Scene*` | 1080×1920 | 60–188 | Each scene on its own timeline                 |
| `Dev/DevSheet`           | 1920×1080 | 60     | Character sheet with every Biscuit pose        |

Scene ranges: Hook 0–180 (a "Meet Biscuit" intro while he finishes a pizza slice, then the "had → needed a plan" beat and a crossed-out pizza thought), MealPlan 180–270, Shop 270–360, CookAndCheckOff 360–450 (hard cut at 415), Train 450–570, Payoff 570–660, EndCard 660–720. Each scene sequence runs 8 frames past its range, so the 8-frame transitions keep the starts exact and the total at 720.

## Props (Zod schema in `src/schema.ts`)

- `petName`, plus `headlines.*` for each scene (`intro`/`introTag` are the opening "Meet {pet}." title and its tag). In `hook`, `{pet}` is replaced with the pet's name, and `hookStruck`/`hookReplacement` control the strike-through (its "needed" pop lands on the spoken word, frame 107).
- `playStoreLive` (default `true`, since the app is live on both stores). Set it to `false` and the Play pill reads "Coming soon on Google Play".
- `musicSrc`: optional file in `public/` or a URL; defaults to `music/rising-forest.mp3`. It fades out over the last 15 frames.
- `sfx.tap|whoosh|tick|chime`: optional. Every paw tap, card whoosh, check tick and the PR chime already has an `<SfxCue>`. Leave a field empty to keep that sound silent.

## Voiceover

`CheferAd-Voiceover/CheferAd-Heart` is the main cut narrated by Kokoro's `af_heart` (`voiceover: "heart"`). The workout beat is one line: "Workouts that keep up with him... all the way to a new PR." The ad ends with just "Chefer." on the logo. Any composition accepts the prop, landscape included.

The clips come from [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), an open-source text-to-speech model (Apache-2.0) that runs locally. The script, voices and start frames live in `scripts/voiceover-lines.json`.

One-time setup (about 354 MB, everything under the gitignored `.tts/`):

```bash
python3 -m venv .tts/venv && .tts/venv/bin/pip install kokoro-onnx soundfile
mkdir -p .tts/models && cd .tts/models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Then regenerate the clips (ffmpeg must be on PATH):

```bash
node scripts/generate-voiceover.mjs          # all voices
node scripts/generate-voiceover.mjs heart    # one voice
```

This writes `public/voiceover/<voice>/*.wav` and `src/voiceover-manifest.json`, and fails if any line overlaps the next one. Changing `petName` does **not** change the spoken name; regenerate for that. To try another voice, list them with `.tts/venv/bin/python -I scripts/kokoro_tts.py --list-voices`.

Music sits at 0.55 under narration, ducks to about 40% of that while a line plays, and fades out over the last 15 frames. `musicStartSeconds` skips a slow intro and `musicVolume` levels quieter tracks. Track options are listed in `public/music/SOURCES.md`.

## Layout

- `src/theme.ts`: brand colours, the three app springs (snappy, gentle, bouncy) and the enter/exit beziers.
- `src/layout.tsx`: scenes draw on a fixed 1080×1320 stage. Vertical places it under the headline (top third); landscape scales it into the right-hand column.
- `src/components/`: `Biscuit` (pure SVG, frame-math animation), `Logo` (the app icon SVG), `Phone` + `TabBar`, `fx` (tap paw, ripple, burst, ring, kibble confetti), `illustrations`, `Sfx`.
- `src/scenes/`: one file per scene.

The ad is drawn entirely in SVG or CSS, with no image assets.

## Store screenshots and feature graphic

`src/store/` holds the captioned store screenshots and the Play feature graphic (`docs/app-store/aso-plan.md` §4.1, §4.3). They are one-frame compositions under the **Store** folder in Studio, and they use the raw app captures in `public/store/ios` and `public/store/play`.

```bash
node scripts/render-store.mjs            # renders every still into docs/app-store/aso-creatives-v1/
```

See [`docs/app-store/aso-creatives-v1/README.md`](../../docs/app-store/aso-creatives-v1/README.md) for the sets, the frame list and what to change where.
