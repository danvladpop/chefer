import { View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';

// B-40 (T-36.2): the rest-timer background-notification permission used to be
// asked cold, at workout START (`use-active-workout.ts`'s old
// `ensureRestNotificationPermission()` call) — before the user had any reason
// to care. It's now asked, in context, with this rationale sheet the FIRST
// time a rest actually starts (`rest-timer-bar.tsx`), never before.

/**
 * `notifications`: the OS notification permission (B-40). `exactAlarms`
 * (Android 12+, asked once per device, owner decision 2026-10-23): the
 * "Alarms & reminders" switch, without which a rest longer than ~3 min can ring
 * up to a minute late.
 */
export type RestPermissionStep = 'notifications' | 'exactAlarms';

const COPY: Record<RestPermissionStep, { body: string; allow: string }> = {
  notifications: {
    body: 'Want a buzz when your rest is over, even with the phone locked?',
    allow: 'Allow notifications',
  },
  exactAlarms: {
    body: 'Long rests can buzz up to a minute late unless Chefer may set exact alarms. Turn on "Alarms & reminders" for Chefer in Settings?',
    allow: 'Open Settings',
  },
};

export interface RestPermissionSheetProps {
  visible: boolean;
  onClose: () => void;
  onAllow: () => void;
  step?: RestPermissionStep;
  testID?: string;
}

export function RestPermissionSheet({
  visible,
  onClose,
  onAllow,
  step = 'notifications',
  testID = 'gym-rest-permission',
}: RestPermissionSheetProps) {
  const copy = COPY[step];
  return (
    <Sheet visible={visible} onClose={onClose} title="Rest timer" testID={testID}>
      <Text testID={`${testID}-body`}>{copy.body}</Text>
      <View className="gap-2 pt-3">
        <Button testID={`${testID}-allow`} size="lg" onPress={onAllow}>
          {copy.allow}
        </Button>
        <Button testID={`${testID}-dismiss`} size="lg" variant="outline" onPress={onClose}>
          Not now
        </Button>
      </View>
    </Sheet>
  );
}
