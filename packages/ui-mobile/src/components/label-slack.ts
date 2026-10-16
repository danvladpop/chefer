import { Platform } from 'react-native';

// ─── Android: a little slack after a shrink-wrapped button label ─────────────
// A button label is a single-line Text shrink-wrapped to its measured width
// and centred next to its icon. On Android React Native sizes that Text to
// exactly the width it measured; at draw time the text view lays the label
// out again inside that frame and, at some densities and window widths, needs
// a pixel or two more — so it re-wraps and the last word drops onto a second
// line the one-line-tall frame clips (seen on a 2x, 1280 dp tablet: the
// recipe screen's "Add to my week" read "Add to my").
//
// `numberOfLines={1}` hides it but cannot wrap a label that genuinely needs
// two lines (a long label in a half-width button on a 320 pt phone, or any
// label at a large font scale, App Review R-20). Letting the label fill the
// button instead moves the icon away from it. So the label gets a trailing
// no-break space: it binds to the last word (never wraps on its own, never
// hangs past the line end like a plain space), adds a quarter em of measured
// width, and draws nothing — the drawn glyphs now have room to spare, and a
// label that really needs two lines still wraps the same way. Android only;
// iOS measures and draws with the same metrics.
//
// Only the drawn text gets it: callers keep `accessibilityLabel` set to the
// plain label, so screen readers and e2e selectors see clean text.

const NO_BREAK_SPACE = '\u00A0';

/** The label to draw in a shrink-wrapped button Text (see above). */
export function withLabelSlack(label: string, os: typeof Platform.OS = Platform.OS): string {
  return os === 'android' ? `${label}${NO_BREAK_SPACE}` : label;
}
