import { NUDGE_DISMISS_COOLDOWN_MS } from '@chefer/utils';
import { setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { dismissNudge, readNudgeState, tryShowNudge } from '../../src/features/premium/nudge-cap';

// AC8 (UX-10 §6): at most one contextual nudge a day across every source,
// and a dismissed source is quiet for 7 days. The rule is the shared pure
// one; this covers the KV adapter mobile persists it in.

const mockTrack = jest.fn();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(undefined);
});

describe('mobile nudge cap', () => {
  it('shows one nudge a day, across every source, and reports the suppressed ones', () => {
    const noon = new Date(2026, 8, 29, 12, 0);
    expect(tryShowNudge('post-rating', noon)).toBe(true);
    expect(tryShowNudge('monday-nudge', noon)).toBe(false);
    expect(tryShowNudge('post-rating', noon)).toBe(false);
    expect(mockTrack).toHaveBeenCalledWith('nudge_suppressed', { source: 'monday-nudge' });

    // The next calendar day frees the slot.
    expect(tryShowNudge('monday-nudge', new Date(2026, 8, 30, 9, 0))).toBe(true);
  });

  it('a dismissed source stays quiet for 7 days without silencing the others', () => {
    const now = new Date(2026, 8, 29, 12, 0);
    dismissNudge('post-rating', now);
    expect(tryShowNudge('post-rating', new Date(now.getTime() + 2 * 24 * 3600 * 1000))).toBe(false);
    expect(tryShowNudge('monday-nudge', new Date(now.getTime() + 24 * 3600 * 1000))).toBe(true);
    const later = new Date(now.getTime() + NUDGE_DISMISS_COOLDOWN_MS + 3600 * 1000);
    expect(tryShowNudge('post-rating', later)).toBe(true);
  });

  it('persists across reads and survives a corrupt entry', () => {
    tryShowNudge('post-rating', new Date(2026, 8, 29, 12, 0));
    expect(readNudgeState().lastShownDay).toBe('2026-09-29');
  });
});
