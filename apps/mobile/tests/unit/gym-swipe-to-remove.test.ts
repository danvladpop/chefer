import { shouldClaimSwipe, shouldRemove } from '../../src/components/swipe-to-remove';

// T-05.A1.2 (PAT-16, Δ2.6): the gesture-threshold logic behind
// swipe-to-remove.tsx, tested as pure functions rather than by simulating
// PanResponder's native touch-responder lifecycle (which RNTL cannot drive
// end-to-end). The component itself is covered by the set-row swipe test in
// gym-workout.test.tsx (renders + accessibility action).

describe('shouldClaimSwipe', () => {
  it('claims a clearly horizontal drag', () => {
    expect(shouldClaimSwipe(-20, 2)).toBe(true);
    expect(shouldClaimSwipe(20, -2)).toBe(true);
  });

  it('does not claim a small movement (jitter)', () => {
    expect(shouldClaimSwipe(5, 1)).toBe(false);
    expect(shouldClaimSwipe(-11, 0)).toBe(false);
  });

  it('does not claim a vertical scroll, even past the dx floor', () => {
    // dy dominates: this is a scroll, not a swipe — must be left to the ScrollView.
    expect(shouldClaimSwipe(14, 20)).toBe(false);
    expect(shouldClaimSwipe(-14, -30)).toBe(false);
  });

  it('claims a diagonal drag once dx is clearly more than 2x dy', () => {
    expect(shouldClaimSwipe(-30, 10)).toBe(true);
    expect(shouldClaimSwipe(-30, 14.9)).toBe(true);
    expect(shouldClaimSwipe(-30, 15.1)).toBe(false);
  });
});

describe('shouldRemove', () => {
  const WIDTH = 300;

  it('does not remove a rightward release', () => {
    expect(shouldRemove(50, WIDTH, 0.6)).toBe(false);
    expect(shouldRemove(0, WIDTH, 2)).toBe(false);
  });

  it('removes once the drag crosses the width fraction', () => {
    expect(shouldRemove(-(WIDTH * 0.35 + 1), WIDTH, 0)).toBe(true);
    expect(shouldRemove(-(WIDTH * 0.35 - 1), WIDTH, 0)).toBe(false);
  });

  it('removes on a fast flick even if short of the distance threshold', () => {
    expect(shouldRemove(-20, WIDTH, -0.6)).toBe(true);
    expect(shouldRemove(-20, WIDTH, -0.4)).toBe(false);
  });

  it('falls back to the flick-only rule when the row has not laid out yet', () => {
    expect(shouldRemove(-20, 0, -0.6)).toBe(true);
    expect(shouldRemove(-5, 0, -0.6)).toBe(false);
    expect(shouldRemove(-20, 0, -0.2)).toBe(false);
  });
});
