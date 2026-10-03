import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

// WP-02 / audit §6.8 (GYM-04, GYM-11, ACC-20): a notification switch that says
// "On" while the OS has notifications denied is a lie, and the only way out is
// the phone's Settings app. This hook is the one place that reads the OS state
// (never prompts — asking stays in each feature's own user-action path) and
// re-reads it when the app returns to the foreground, i.e. after the user came
// back from Settings. Pair it with `NotificationsOffRow`.

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Reads the OS permission without prompting. Any failure reads as "undetermined". */
export async function readNotificationPermission(): Promise<NotificationPermissionStatus> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    // The enum's values are the plain strings; comparing as text keeps this
    // working against the module mocks in tests.
    return String(current.status) === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

type Listener = () => void;
const refreshListeners = new Set<Listener>();

/**
 * Re-reads the permission for every mounted `useNotificationPermission()` —
 * call it after a feature's own `requestPermissionsAsync()` so the row reflects
 * the answer without waiting for a foreground change.
 */
export function refreshNotificationPermission(): void {
  refreshListeners.forEach((listener) => listener());
}

/**
 * `'granted' | 'denied' | 'undetermined'`, re-checked on mount, whenever the
 * app becomes active again, and on `refreshNotificationPermission()`.
 * `undetermined` also covers "not read yet" and "could not read".
 */
export function useNotificationPermission(): NotificationPermissionStatus {
  const [status, setStatus] = useState<NotificationPermissionStatus>('undetermined');

  const refresh = useCallback(() => {
    void readNotificationPermission().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    refreshListeners.add(refresh);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      refreshListeners.delete(refresh);
      subscription.remove();
    };
  }, [refresh]);

  return status;
}
