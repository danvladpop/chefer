import { View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';

// B-40 (T-36.2): the rest-timer background-notification permission used to be
// asked cold, at workout START (`use-active-workout.ts`'s old
// `ensureRestNotificationPermission()` call) — before the user had any reason
// to care. It's now asked, in context, with this rationale sheet the FIRST
// time a rest actually starts (`rest-timer-bar.tsx`), never before.

export interface RestPermissionSheetProps {
  visible: boolean;
  onClose: () => void;
  onAllow: () => void;
  testID?: string;
}

export function RestPermissionSheet({
  visible,
  onClose,
  onAllow,
  testID = 'gym-rest-permission',
}: RestPermissionSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Rest timer" testID={testID}>
      <Text testID={`${testID}-body`}>
        Want a buzz when your rest is over, even with the phone locked?
      </Text>
      <View className="gap-2 pt-3">
        <Button testID={`${testID}-allow`} size="lg" onPress={onAllow}>
          Allow notifications
        </Button>
        <Button testID={`${testID}-dismiss`} size="lg" variant="outline" onPress={onClose}>
          Not now
        </Button>
      </View>
    </Sheet>
  );
}
