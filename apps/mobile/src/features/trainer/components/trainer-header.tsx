import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';

// The header row of every trainer and coaching stack screen (the root Stack has `headerShown: false`):
// the new shell's pushed-page top bar — a 44 pt chevron Back and the title (title1) as the screen's one
// heading — so these screens read like the rest of the app when reached from You.

/** Every trainer/coaching screen runs edge to edge on the canvas, like the shell's pushed screens. */
export const TRAINER_SCREEN_CLASS = 'bg-canvas px-0';

export function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function TrainerHeader({
  title,
  right,
  onBack,
  testID,
}: {
  title: string;
  right?: ReactNode;
  /** Defaults to going back (or home when there is nothing to go back to). */
  onBack?: () => void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <View testID={testID} className="min-h-11 flex-row items-center gap-1 px-4 py-2">
      <IconButton
        testID={`${testID}-back`}
        accessibilityLabel="Back"
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={onBack ?? goBackOrHome}
        className="-ml-2"
      />
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        className="min-w-0 flex-1 text-title1 font-bold text-label"
        numberOfLines={2}
      >
        {title}
      </Text>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}
