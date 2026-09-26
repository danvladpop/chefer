import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { weeklyNotificationUrl } from './weekly-notifications';

// Opens the plan or the recap when a weekly notification is tapped (audit
// P2-5) — both while the app runs and from a cold start. Only notifications
// tagged by weekly-notifications.ts carry a route; gym reminders and the rest
// timer are ignored. Mounted once in the root layout; inert while signed out
// (the signed-in routes don't exist then).

export function useNotificationLinks(signedIn: boolean): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      const url = weeklyNotificationUrl(response.notification.request.content.data);
      if (!url || handled.current === `${id}:${response.notification.date}`) return;
      handled.current = `${id}:${response.notification.date}`;
      try {
        router.push(url);
      } catch {
        // navigator not mounted yet — the user lands on Home instead
      }
    };

    // Cold start: the tap that launched the app. Deferred a beat so the root
    // Stack has mounted before we navigate.
    let launch: Notifications.NotificationResponse | null = null;
    try {
      launch = Notifications.getLastNotificationResponse();
    } catch {
      // no native module (tests) or no launch response
    }
    const timer = setTimeout(() => open(launch), 300);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [signedIn]);
}
