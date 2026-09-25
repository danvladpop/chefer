import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

// React Native has no window online/focus events, so TanStack Query is fed
// from NetInfo (online) and AppState (focus) — the documented RN recipe.
// Effects: paused queries/mutations resume on reconnect, stale queries
// refetch when the app returns to the foreground, and the gym outbox reads
// onlineManager.isOnline().

let installed = false;

export function installQueryConnectivity(): void {
  if (installed) return;
  installed = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
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
