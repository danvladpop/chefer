import { useWindowDimensions } from 'react-native';

// ─── Large screens (tablet, landscape, foldable) ────────────────────────────
// The app is designed for a phone column. On a wide window (an Android tablet,
// a foldable's inner screen, a phone in landscape) full-width content turns
// into 1,200 pt buttons and switches a screen away from their labels, so the
// readable content is capped at one column and centred:
//  - `Screen` pads its sides out to that column (the background still fills
//    the window), so every screen, its header and its ScrollView/FlatList
//    content get the cap without touching each one;
//  - `Sheet` caps its panel at SHEET_MAX_WIDTH and centres it;
//  - heroes (exercise photo, recipe photo) cap their height at a fraction of
//    the window instead of growing with its width.
// Everything here is derived from `useWindowDimensions`, so rotation, split
// screen and window resizing re-lay the column out. At phone widths nothing
// changes: the gutter is 0 and `Screen` keeps its own className padding.

/** Widest readable content column (pt). */
export const READABLE_MAX_WIDTH = 680;

/** Widest bottom-sheet panel (pt); narrower windows get a full-width panel. */
export const SHEET_MAX_WIDTH = 640;

/**
 * The cap only kicks in once each side would get at least this much (pt), so
 * it never squeezes a screen's own padding (`px-0`/`px-4`/`px-6`) on windows
 * just a little wider than the column.
 */
export const READABLE_MIN_GUTTER = 24;

/** Largest share of the window height a hero photo may take. */
export const HERO_MAX_HEIGHT_FRACTION = 0.4;

/**
 * Side padding (pt) that centres a READABLE_MAX_WIDTH column in a window this
 * wide, or 0 when the window is phone-sized (the screen keeps its own padding).
 */
export function readableGutter(windowWidth: number): number {
  const gutter = Math.floor((windowWidth - READABLE_MAX_WIDTH) / 2);
  return gutter >= READABLE_MIN_GUTTER ? gutter : 0;
}

/**
 * Width (pt) of the readable column — the window's width on a phone, the
 * capped column on a wide window. Safe-area side insets are not subtracted.
 */
export function readableContentWidth(windowWidth: number): number {
  return windowWidth - 2 * readableGutter(windowWidth);
}

/**
 * Widest a hero of this aspect ratio (width / height) may be so its height
 * stays within HERO_MAX_HEIGHT_FRACTION of the window. Use it as `maxWidth`
 * next to `width: '100%'` + `aspectRatio` + `alignSelf: 'center'`. On a phone
 * in portrait it is wider than the screen, so nothing changes there.
 */
export function heroMaxWidth(windowHeight: number, aspectRatio: number): number {
  return Math.floor(windowHeight * HERO_MAX_HEIGHT_FRACTION * aspectRatio);
}

/**
 * Height (pt) of a full-width hero that is `minHeight` on a phone and grows
 * with the readable column (at `aspectRatio`) on wider windows, never past
 * HERO_MAX_HEIGHT_FRACTION of the window. `horizontalPadding` is the padding
 * around the hero inside the column (both sides together).
 */
export function heroHeight({
  windowWidth,
  windowHeight,
  minHeight,
  aspectRatio,
  horizontalPadding = 0,
}: {
  windowWidth: number;
  windowHeight: number;
  minHeight: number;
  aspectRatio: number;
  horizontalPadding?: number;
}): number {
  const width = readableContentWidth(windowWidth) - horizontalPadding;
  const natural = Math.round(width / aspectRatio);
  const cap = Math.floor(windowHeight * HERO_MAX_HEIGHT_FRACTION);
  return Math.max(minHeight, Math.min(natural, cap));
}

export interface ReadableLayout {
  /** Side padding that centres the readable column; 0 on phone-sized windows. */
  gutter: number;
  /** Width of the readable column (the window width when `gutter` is 0). */
  contentWidth: number;
  windowWidth: number;
  windowHeight: number;
}

/** The readable column for the current window; follows rotation and resizing. */
export function useReadableLayout(): ReadableLayout {
  const { width, height } = useWindowDimensions();
  const gutter = readableGutter(width);
  return { gutter, contentWidth: width - 2 * gutter, windowWidth: width, windowHeight: height };
}
