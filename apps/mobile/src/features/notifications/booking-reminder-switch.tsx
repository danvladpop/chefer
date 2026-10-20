import { useState } from 'react';
import { Switch, View } from 'react-native';
import { BOOKING_COPY } from '@chefer/types';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import type { BookingReminderRole } from '@chefer/utils';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureGymReminderPermission } from '../gym/reminders/permission';
import { requestBookingReminderSync, setBookingReminderPref } from './booking-reminders';
import { useBookingReminderPrefs } from './use-booking-reminders';

// "Booking reminders" (trainer-mode.md §7.3): Settings → Notifications for a
// client, trainer You for a trainer. Default on. Turning it on is a user
// action, so the OS permission is asked here; a refusal leaves it off and shows
// the standard "Off for Chefer" row. Scheduling is BookingReminderHost's job.

export function BookingReminderSwitch({
  role,
  testID,
}: {
  role: BookingReminderRole;
  testID: string;
}) {
  const colors = useThemeColors();
  const prefs = useBookingReminderPrefs();
  const permission = useNotificationPermission();
  const [refused, setRefused] = useState(false);
  const denied = permission === 'denied' || refused;

  const change = (next: boolean) => {
    if (!next) {
      setRefused(false);
      setBookingReminderPref(role, false);
      return;
    }
    void ensureGymReminderPermission().then((allowed) => {
      refreshNotificationPermission();
      setRefused(!allowed);
      if (allowed) {
        setBookingReminderPref(role, true);
        requestBookingReminderSync();
      }
    });
  };

  return (
    <View className="gap-1">
      <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
        <View className="min-w-0 flex-1">
          <Text className="text-body text-label">{BOOKING_COPY.reminders.setting}</Text>
          <Text className="mt-0.5 text-subhead text-label-secondary">
            {BOOKING_COPY.reminders.settingHint}
          </Text>
        </View>
        <Switch
          testID={testID}
          accessibilityLabel={BOOKING_COPY.reminders.setting}
          value={prefs[role] && !denied}
          onValueChange={change}
          trackColor={{ true: colors.brand, false: colors.separator }}
        />
      </View>
      {denied ? (
        <NotificationsOffRow testID={`${testID}-off`} message={BOOKING_COPY.reminders.off} />
      ) : null}
    </View>
  );
}
