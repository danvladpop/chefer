// Store screenshot sets (docs/app-store/aso-plan.md §4.1, §4.4). Every entry
// here becomes a still composition in Root.tsx, and scripts/render-store.mjs
// renders all of them into docs/app-store/aso-creatives-v1/.

/** Raw app captures in public/store/<platform>/<screen>.jpg. */
export type ScreenName =
  | "plan"
  | "shopping"
  | "cook"
  | "today"
  | "gym-summary"
  | "gym-workout"
  | "gym-routine";

/** Zoomed-in crop of the screen, as fractions of the raw capture. */
export type Callout = { x: number; y: number; w: number; h: number };

export type Frame = {
  slug: string;
  /** `*word*` renders in the brand colour. */
  caption: string;
  subline?: string;
  /** cream for food frames, brand (brown) for the gym pillar. */
  tone: "cream" | "brand";
  /** One screen in a phone, or three fanned phones (summary collage). */
  screens: ScreenName[];
  /** Per-platform crops, because the Play captures have no status bar. */
  callout?: { ios: Callout; play: Callout };
  /** Not part of the props; listed in the README "needs a fresh capture" table. */
  recapture?: string;
};

// The §4.1 table, numbered as in the plan.
export const FRAMES: Record<number, Frame> = {
  1: {
    slug: "ai-meal-plan",
    caption: "A week of meals, *planned by AI*",
    tone: "cream",
    screens: ["plan"],
  },
  2: {
    slug: "allergy-checked",
    caption: "Checked for *every allergy* at your table",
    tone: "cream",
    screens: ["plan"],
    callout: {
      ios: { x: 0.02, y: 0.297, w: 0.5, h: 0.062 },
      play: { x: 0.02, y: 0.268, w: 0.5, h: 0.068 },
    },
    recapture:
      "Plan tab for a household of 2–3 with different allergies, so the “Checked for your table” line names more than one person (today it reads “Checked for Peanuts (you)”).",
  },
  3: {
    slug: "grocery-list",
    caption: "*One grocery list* for the whole week",
    tone: "cream",
    screens: ["shopping"],
  },
  4: {
    slug: "cook-mode",
    caption: "Cook step by step, *hands free*",
    tone: "cream",
    screens: ["cook"],
    recapture:
      "Cook mode on a step with a running timer and an ingredient list or photo, so the lower half of the screen isn’t empty.",
  },
  5: {
    slug: "calories-macros",
    caption: "Hit your *calories and macros*",
    tone: "cream",
    screens: ["today"],
    recapture:
      "Today / tracker scrolled to the calorie and macro rings (the 1.0.1 capture shows tomorrow’s breakfast at the top instead).",
  },
  6: {
    slug: "progressive-overload",
    caption: "A gym log that tells you *what to lift next*",
    tone: "brand",
    screens: ["gym-summary"],
    callout: {
      ios: { x: 0.02, y: 0.598, w: 0.96, h: 0.142 },
      play: { x: 0.02, y: 0.595, w: 0.96, h: 0.154 },
    },
  },
  7: {
    slug: "gym-floor",
    caption: "Built for the gym floor: *offline, rest timer*",
    tone: "brand",
    screens: ["gym-workout"],
  },
  8: {
    slug: "privacy",
    caption: "No ads. *Your data stays yours.*",
    subline: "Export it or delete your account from the app at any time.",
    tone: "cream",
    screens: ["shopping", "plan", "gym-summary"],
    recapture:
      "Privacy & data screen (More → Profile → Privacy & data) to replace this collage, if the owner prefers a real screen here.",
  },
};

/** The gym routine screen only appears in the gym CPP, so it has no §4.1 number. */
export const ROUTINE_FRAME: Frame = {
  slug: "gym-routine",
  caption: "Every lift shows *your next target*",
  tone: "brand",
  screens: ["gym-routine"],
};

export type FrameRef = number | "routine";

export const frameFor = (ref: FrameRef): Frame =>
  ref === "routine" ? ROUTINE_FRAME : FRAMES[ref];

export type Device = "play" | "ios";

export type SizeSpec = {
  width: number;
  height: number;
  device: Device;
};

// Play: 2:1 is the store's longest allowed side ratio, so 1320×2640 (not
// 1080×2340, which is 2.17:1). iOS: 6.9" and the 6.3" size ASC took for 1.0.1.
export const SIZES = {
  play: { width: 1320, height: 2640, device: "play" },
  "ios-6.9": { width: 1320, height: 2868, device: "ios" },
  "ios-6.3": { width: 1206, height: 2622, device: "ios" },
} as const satisfies Record<string, SizeSpec>;

export type SizeKey = keyof typeof SIZES;

export type StoreSet = {
  /** Folder in docs/app-store/aso-creatives-v1/ and composition id prefix. */
  id: string;
  order: FrameRef[];
  sizes: SizeKey[];
};

export const SETS: StoreSet[] = [
  { id: "play", order: [1, 2, 3, 4, 5, 6, 7, 8], sizes: ["play"] },
  {
    id: "ios",
    order: [1, 2, 3, 4, 5, 6, 7, 8],
    sizes: ["ios-6.9", "ios-6.3"],
  },
  // iOS Custom Product Page "Gym log" (§4.4): frames 6, 7, routine, 1, 3.
  {
    id: "ios-cpp-gym",
    order: [6, 7, "routine", 1, 3],
    sizes: ["ios-6.9", "ios-6.3"],
  },
];
