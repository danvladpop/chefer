import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

// React Native has no window online/focus events, so TanStack Query is fed
// from NetInfo (online) and AppState (focus) — the documented RN recipe.
// Effects: paused queries/mutations resume on reconnect, stale queries
// refetch when the app returns to the foreground, and the gym outbox reads
// onlineManager.isOnline().

/**
 * Bug B-29 (T-BUG-29): "Editing routines needs a connection" flashed while
 * genuinely online — `isConnected` is link-layer only (Wi-Fi associated,
 * cellular radio up) and can flap false for a moment on some Android devices
 * (host load, a captive-portal re-check) with no real loss of internet.
 * `isInternetReachable` is NetInfo's own reachability probe and is what the
 * gym outbox actually needs; `null` (not yet determined) still counts as
 * online, same leniency as the old check, just on the more relevant signal.
 */
export function deriveOnline(state: Pick<NetInfoState, 'isInternetReachable'>): boolean {
  return state.isInternetReachable !== false;
}

let installed = false;

export function installQueryConnectivity(): void {
  if (installed) return;
  installed = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(deriveOnline(state));
    }),
  );

  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (Platform.OS !== 'web') {
        setFocused(status === 'active');
      }
    });
    return () => subscription.remove();
  });
}
