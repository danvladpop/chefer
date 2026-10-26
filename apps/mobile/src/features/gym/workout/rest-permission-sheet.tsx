import { View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';

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
  const { t } = useT();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('gym.workout.logger.rest.permissionTitle')}
      testID={testID}
    >
      <Text testID={`${testID}-body`}>{t('gym.workout.logger.rest.permissionBody')}</Text>
      <View className="gap-2 pt-3">
        <Button testID={`${testID}-allow`} size="lg" onPress={onAllow}>
          {t('gym.workout.logger.rest.allow')}
        </Button>
        <Button testID={`${testID}-dismiss`} size="lg" variant="outline" onPress={onClose}>
          {t('gym.workout.logger.rest.notNow')}
        </Button>
      </View>
    </Sheet>
  );
}
