import { describe, expect, it } from 'vitest';
import {
  canShowNudge,
  INITIAL_NUDGE_CAP_STATE,
  markNudgeDismissed,
  markNudgeShown,
  type NudgeCapState,
} from './nudge-cap';

describe('nudge frequency cap (pure rule)', () => {
  it('allows the first nudge of the day', () => {
    expect(canShowNudge('post-rating', INITIAL_NUDGE_CAP_STATE)).toBe(true);
  });

  it('caps at one nudge per day across ALL sources', () => {
    const shown = markNudgeShown(INITIAL_NUDGE_CAP_STATE);
    expect(canShowNudge('post-rating', shown)).toBe(false);
    expect(canShowNudge('monday-nudge', shown)).toBe(false);
  });

  it('silences a dismissed source for 7 days without touching others', () => {
    const now = new Date();
    const state: NudgeCapState = markNudgeDismissed('post-rating', INITIAL_NUDGE_CAP_STATE, now);
    expect(canShowNudge('post-rating', state, now)).toBe(false);
    expect(canShowNudge('monday-nudge', state, now)).toBe(true);

    const day = 24 * 60 * 60 * 1000;
    expect(canShowNudge('post-rating', state, new Date(now.getTime() + 6 * day))).toBe(false);
    expect(canShowNudge('post-rating', state, new Date(now.getTime() + 8 * day))).toBe(true);
  });
});
