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
  /** The explanation under it; `null` when `message` already says it all. */
  detail?: string | null;
  /** The Settings button's label. */
  actionLabel?: string;
  className?: string;
  testID?: string;
}

export function NotificationsOffRow({
  message = 'Off for Chefer',
  detail = "Notifications are turned off for Chefer in your phone's Settings.",
  actionLabel = 'Open Settings',
  className,
  testID = 'notifications-off-row',
}: NotificationsOffRowProps) {
  return (
    <View
      testID={testID}
      className={cn('flex-row items-center gap-3 rounded-control bg-brand-tint p-3', className)}
    >
      <View className="min-w-0 flex-1">
        <Text testID={`${testID}-message`} className="text-subhead font-semibold text-attention">
          {message}
        </Text>
        {detail ? <Text className="text-caption text-label-secondary">{detail}</Text> : null}
      </View>
      <Button
        testID={`${testID}-open-settings`}
        variant="outline"
        size="sm"
        accessibilityLabel={actionLabel}
        onPress={() => void Linking.openSettings()}
      >
        {actionLabel}
      </Button>
    </View>
  );
}
