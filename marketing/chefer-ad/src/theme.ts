import { loadFont } from "@remotion/google-fonts/Inter";
import { Easing, spring, SpringConfig } from "remotion";

// Inter 600 for UI, 800 for headlines (700 for a few emphasis labels).
export const { fontFamily } = loadFont("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});

// Brand colours, taken verbatim from the app's tokens.
export const C = {
  canvas: "#FAF7F2",
  surface: "#FFFFFF",
  surfaceSunken: "#F2ECE4",
  separator: "#E6DED3",
  label: "#1C1917",
  labelSecondary: "#57534E",
  brand: "#944A00",
  brandTint: "#F6EADB",
  positive: "#2D7A4B",
  attention: "#A85100",
  logoFrom: "#A9570A",
  logoTo: "#7E3E00",
  cream: "#FFF4E6",
  ring: "#E9CFAE",
} as const;

// The app's springs (MO tokens), mapped onto Remotion spring() configs.
export const SNAPPY: Partial<SpringConfig> = {
  damping: 30,
  stiffness: 500,
  mass: 1,
};
export const GENTLE: Partial<SpringConfig> = {
  damping: 26,
  stiffness: 260,
  mass: 1,
};
export const BOUNCY: Partial<SpringConfig> = {
  damping: 18,
  stiffness: 420,
  mass: 1,
};

export const EASE_ENTER = Easing.bezier(0.05, 0.7, 0.1, 1);
export const EASE_EXIT = Easing.bezier(0.3, 0, 0.8, 0.15);

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** spring() that starts at `at` (local frame) with one of the app configs. */
export const sp = (
  frame: number,
  fps: number,
  at: number,
  config: Partial<SpringConfig>,
) => spring({ frame: frame - at, fps, config });

export const CARD_SHADOW =
  "0 1px 2px rgba(28,25,23,0.06), 0 10px 28px rgba(28,25,23,0.08)";
export const PHONE_SHADOW =
  "0 30px 60px rgba(28,25,23,0.22), 0 8px 18px rgba(28,25,23,0.12)";

/** Every transition between scenes is 8 frames. */
export const TRANSITION = 8;

export const formatThousands = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
