// Exports static Biscuit poses as inline SVG for the design-canvas boards.
// Usage: tsx scripts/board-svg/export.tsx <outDir>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Biscuit, type BiscuitProps } from "./BiscuitStatic";

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const poses: Record<string, { frame: number; props: BiscuitProps }> = {
  welcome: { frame: 30, props: { pose: "wink", tailWag: 0.9, blink: false } },
  curious: {
    frame: 20,
    props: { pose: "stand", headTilt: 8, eyesWide: 0.6, blink: false },
  },
  goalLose: {
    frame: 0,
    props: {
      pose: "proud",
      bodyWidth: 0.82,
      eyesWide: 1,
      mood: "focused",
      headTilt: -6,
      blink: false,
    },
  },
  goalMuscle: {
    frame: 0,
    props: {
      pose: "squat",
      accessory: "headband",
      holding: "dumbbell",
      squatDepth: 0.6,
      mood: "focused",
      blink: false,
    },
  },
  goalHealthy: {
    frame: 0,
    props: {
      pose: "proud",
      armRaise: 0.8,
      holding: "carrot",
      mood: "proud",
      blink: false,
    },
  },
  goalFood: {
    frame: 0,
    props: { pose: "stand", accessory: "chefHat", mood: "happy", blink: false },
  },
  scale: { frame: 0, props: { pose: "stand", eyesWide: 0.8, blink: false } },
  sniff: {
    frame: 0,
    props: { pose: "stand", headTilt: 12, mood: "focused", blink: false },
  },
  cooking: {
    frame: 0,
    props: {
      pose: "stand",
      accessory: "chefHat",
      reach: 0.45,
      mood: "happy",
      blink: false,
    },
  },
  ready: {
    frame: 0,
    props: { pose: "proud", mood: "proud", tailWag: 1, blink: false },
  },
  premium: {
    frame: 0,
    props: {
      pose: "proud",
      accessory: "crown",
      armRaise: 1,
      mood: "proud",
      blink: false,
    },
  },
  allSet: { frame: 20, props: { pose: "wink", mood: "excited", blink: false } },
  lie: { frame: 0, props: { pose: "lie", mood: "sad", blink: false } },
};

for (const [name, { frame, props }] of Object.entries(poses)) {
  (globalThis as { __FRAME__?: number }).__FRAME__ = frame;
  const svg = renderToStaticMarkup(<Biscuit {...props} size={400} />)
    .replace(/<svg /, '<svg aria-hidden="true" ')
    .replace(/style="[^"]*"/, 'style="overflow: visible; display: block"');
  writeFileSync(join(out, `${name}.svg.html`), svg);
  console.log(name, svg.length);
}
