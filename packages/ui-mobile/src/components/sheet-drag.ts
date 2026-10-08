// MO-02 drag-to-dismiss (docs/audit-2026-09/motion-system.md): the panel follows
// the finger 1:1, an upward drag rubber-bands at 0.2x, and on release it exits
// when the drag passed 30% of the panel's height or was a flick faster than
// 0.5 px/ms — otherwise it springs back. Pure functions so the thresholds are
// unit-testable without a gesture.

/** Release past this fraction of the panel height dismisses. */
export const SHEET_DISMISS_FRACTION = 0.3;
/** A downward flick faster than this (px/ms, PanResponder's `vy`) dismisses. */
export const SHEET_DISMISS_VELOCITY = 0.5;
/** A flick must also have travelled at least this far (pt), so a twitch never closes it. */
export const SHEET_FLICK_MIN_DISTANCE = 24;
/** Upward drags move the panel by this fraction of the finger travel. */
export const SHEET_RUBBER_BAND = 0.2;
/** Finger travel (pt) before the gesture claims the touch from a tap on ✕. */
export const SHEET_DRAG_ACTIVATION = 8;

/** Panel offset (pt, >= 0 is down) for a finger displacement `dy`. */
export function sheetDragOffset(dy: number): number {
  return dy >= 0 ? dy : dy * SHEET_RUBBER_BAND;
}

export type SheetRelease = 'dismiss' | 'snap-back';

/** What to do when the finger lifts: `dy` pt travelled, `vy` px/ms, panel `panelHeight` pt tall. */
export function sheetReleaseAction(dy: number, vy: number, panelHeight: number): SheetRelease {
  if (dy <= 0) return 'snap-back';
  if (panelHeight > 0 && dy >= panelHeight * SHEET_DISMISS_FRACTION) return 'dismiss';
  if (vy >= SHEET_DISMISS_VELOCITY && dy >= SHEET_FLICK_MIN_DISTANCE) return 'dismiss';
  return 'snap-back';
}

/** True when a move should start dragging: mostly vertical and past the activation distance. */
export function shouldStartSheetDrag(dx: number, dy: number): boolean {
  return Math.abs(dy) > SHEET_DRAG_ACTIVATION && Math.abs(dy) > Math.abs(dx) * 1.5;
}
