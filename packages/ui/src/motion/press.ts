// Press feedback (MO-01, motion-system.md §2.5). Every tap answers on
// pointer-down: controls shrink to 0.97, whole cards to 0.98, over the
// `instant` duration with the `standard` curve (web twin of ui-mobile's
// PressableScale). Only transform/colour/shadow transition — never layout.
// Under reduced motion the scale is dropped (colour feedback stays).
//
// These replace a `transition` / `transition-colors` class on the element.

/** The transition half on its own, for containers that scale via `:has()`. */
export const pressTransition =
  'transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-instant ease-standard';

/** Buttons, icon buttons, chips, segments, nav items: scale to 0.97 on press. */
export const pressControl = `${pressTransition} motion-safe:active:scale-[0.97]`;

/** Whole pressable cards and list rows: scale to 0.98 on press. */
export const pressCard = `${pressTransition} motion-safe:active:scale-[0.98]`;
