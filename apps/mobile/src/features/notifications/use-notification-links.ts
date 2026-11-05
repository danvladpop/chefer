import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { openBookingInMode } from '../trainer-mode/open-booking';
import { bookingReminderTarget } from './booking-reminders';
import { foodNudgeNotificationUrl } from './food-nudges';
import { openPushNotification, pushNotificationTarget } from './push/push-links';
import { weeklyNotificationUrl } from './weekly-notifications';

// Opens the plan or the recap when a weekly notification is tapped (audit
// P2-5), and the log or the plan when a food nudge is (UX-PO-08) — both while
// the app runs and from a cold start. A booking reminder (trainer-mode.md §7.3)
// opens that booking in the right mode — the trainer's in trainer mode, the
// client's in personal mode (§5.1: the mode switches before navigating).
// A remote push (M4, tagged `app: 'chefer-push'`) opens by its kind, in the
// mode the kind belongs to (§7.2 "Opens", push/push-links.ts).
// Only notifications tagged by weekly-notifications.ts, food-nudges.ts,
// booking-reminders.ts or the API's push sender carry a route; gym reminders and
// the rest timer are ignored. Mounted once in the root layout; inert while signed out
// (the signed-in routes don't exist then).

export function useNotificationLinks(signedIn: boolean): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      const data = response.notification.request.content.data;
      const push = pushNotificationTarget(data);
      const booking = bookingReminderTarget(data);
      const url = weeklyNotificationUrl(data) ?? foodNudgeNotificationUrl(data);
      if ((!url && !booking && !push) || handled.current === `${id}:${response.notification.date}`)
        return;
      handled.current = `${id}:${response.notification.date}`;
      try {
        if (push) openPushNotification(push);
        else if (booking) openBookingInMode(booking);
        else if (url) router.push(url);
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
