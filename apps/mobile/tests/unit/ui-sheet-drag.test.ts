import {
  SHEET_DISMISS_FRACTION,
  SHEET_DISMISS_VELOCITY,
  SHEET_DRAG_ACTIVATION,
  SHEET_FLICK_MIN_DISTANCE,
  SHEET_RUBBER_BAND,
  sheetDragOffset,
  sheetReleaseAction,
  shouldStartSheetDrag,
} from '@chefer/ui-mobile';

// UX-X-03 / MO-02: the release thresholds of the Sheet's drag-to-dismiss.

const HEIGHT = 500;

describe('sheetReleaseAction', () => {
  it('dismisses once the drag passes 30% of the panel height', () => {
    const edge = HEIGHT * SHEET_DISMISS_FRACTION;
    expect(sheetReleaseAction(edge, 0, HEIGHT)).toBe('dismiss');
    expect(sheetReleaseAction(edge - 1, 0, HEIGHT)).toBe('snap-back');
  });

  it('dismisses on a fast downward flick even over a short distance', () => {
    expect(sheetReleaseAction(SHEET_FLICK_MIN_DISTANCE, SHEET_DISMISS_VELOCITY, HEIGHT)).toBe(
      'dismiss',
    );
    expect(sheetReleaseAction(60, 0.49, HEIGHT)).toBe('snap-back');
  });

  it('never dismisses on a twitch, however fast', () => {
    expect(sheetReleaseAction(SHEET_FLICK_MIN_DISTANCE - 1, 3, HEIGHT)).toBe('snap-back');
  });

  it('snaps back after an upward or zero drag, even with velocity', () => {
    expect(sheetReleaseAction(-80, 2, HEIGHT)).toBe('snap-back');
    expect(sheetReleaseAction(0, 0, HEIGHT)).toBe('snap-back');
  });

  it('falls back to the velocity rule while the panel height is unknown', () => {
    expect(sheetReleaseAction(200, 0, 0)).toBe('snap-back');
    expect(sheetReleaseAction(200, 1, 0)).toBe('dismiss');
  });
});

describe('sheetDragOffset', () => {
  it('follows the finger 1:1 downward and rubber-bands upward at 0.2x', () => {
    expect(sheetDragOffset(120)).toBe(120);
    expect(sheetDragOffset(-100)).toBeCloseTo(-100 * SHEET_RUBBER_BAND);
    expect(sheetDragOffset(0)).toBe(0);
  });
});

describe('shouldStartSheetDrag', () => {
  it('claims the touch only for a mostly-vertical move past the activation distance', () => {
    expect(shouldStartSheetDrag(0, SHEET_DRAG_ACTIVATION + 1)).toBe(true);
    expect(shouldStartSheetDrag(0, SHEET_DRAG_ACTIVATION)).toBe(false); // a tap with jitter
    expect(shouldStartSheetDrag(30, 20)).toBe(false); // sideways
  });
});
