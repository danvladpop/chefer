import { deriveOnline } from '../../src/features/gym/offline/connectivity';

// Bug B-29 (T-BUG-29): "Editing routines needs a connection" while online.
// `isConnected` (link-layer only) could flap false for a moment with no real
// loss of internet; `isInternetReachable` is the more relevant signal, and
// `null` (not yet determined) still counts as online — same leniency as the
// old `isConnected !== false` check, just on the right field.

describe('deriveOnline (bug B-29)', () => {
  it('is online when internet is reachable', () => {
    expect(deriveOnline({ isInternetReachable: true })).toBe(true);
  });

  it('is offline only when reachability is explicitly false', () => {
    expect(deriveOnline({ isInternetReachable: false })).toBe(false);
  });

  it('treats "not yet determined" (null) as online, not a false "needs a connection"', () => {
    expect(deriveOnline({ isInternetReachable: null })).toBe(true);
  });
});
