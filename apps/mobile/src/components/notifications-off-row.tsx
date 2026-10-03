import { Linking, View } from 'react-native';
import { Button, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// The standard "notifications are denied" row (WP-02 / §6.8): shown next to a
// reminder or alert setting while `useNotificationPermission()` says 'denied',
// so the switch is never the only thing on screen claiming reminders work. The
// pattern is the camera-denied block in tracker/scan-meal-card.tsx.

export interface NotificationsOffRowProps {
  /** What stays off, e.g. "Weekly updates". Defaults to the plain line. */
  message?: string;
  className?: string;
  testID?: string;
}

export function NotificationsOffRow({
  message = 'Off for Chefer',
  className,
  testID = 'notifications-off-row',
}: NotificationsOffRowProps) {
  return (
    <View
      testID={testID}
      className={cn('flex-row items-center gap-3 rounded-lg bg-amber-50 p-3', className)}
    >
      <View className="min-w-0 flex-1">
        <Text testID={`${testID}-message`} className="text-sm text-amber-900">
          {message}
        </Text>
        <Text variant="muted" className="text-xs">
          Notifications are turned off for Chefer in your phone&apos;s Settings.
        </Text>
      </View>
      <Button
        testID={`${testID}-open-settings`}
        variant="outline"
        size="sm"
        accessibilityLabel="Open Settings"
        onPress={() => void Linking.openSettings()}
      >
        Open Settings
      </Button>
    </View>
  );
}
