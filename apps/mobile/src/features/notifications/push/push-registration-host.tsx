import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { trpc } from '../../../lib/trpc';
import { registerPushDevice, type PushDeviceApi } from './push-registration';
import { getPushRegistrationRequestTick, subscribePushRegistrationRequests } from './push-store';

// Keeps this device registered for push (trainer-mode.md §7.2, M4): on launch
// (once per launch — the server's lastSeenAt), on every return to the
// foreground (picks up a permission granted in the phone's Settings, and
// notices one revoked there), right after a grant at a moment of value, and
// when the OS rolls the push token. Never prompts. Mounted once in the root
// layout, like BookingReminderHost; inert while signed out.

function PushRegistrationSync(): null {
  const utils = trpc.useUtils();
  const tick = useSyncExternalStore(
    subscribePushRegistrationRequests,
    getPushRegistrationRequestTick,
  );
  const api = useMemo<PushDeviceApi>(
    () => ({
      register: async (input) => {
        // The vanilla client: no app-wide error snackbar or 401 sign-out for a background call.
        await utils.client.notifications.push.register.mutate(input);
        void utils.notifications.push.preferences.invalidate();
      },
    }),
    [utils],
  );

  useEffect(() => {
    void registerPushDevice(api);
  }, [api, tick]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void registerPushDevice(api);
    });
    let tokenSubscription: { remove: () => void } | null = null;
    try {
      tokenSubscription = Notifications.addPushTokenListener((token) => {
        void registerPushDevice(api, token);
      });
    } catch {
      // no push module in this binary — local reminders only
    }
    return () => {
      appState.remove();
      tokenSubscription?.remove();
    };
  }, [api]);

  return null;
}

/** Renders nothing; registers this device for push while signed in. */
export function PushRegistrationHost({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <PushRegistrationSync /> : null;
}
