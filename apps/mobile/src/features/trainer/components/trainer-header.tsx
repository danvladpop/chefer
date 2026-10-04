import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';

// The header row of every trainer stack screen (the root Stack has `headerShown: false`): a 44 pt back
// button and the title as the screen's one heading.

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
  return (
    <View testID={testID} className="min-h-14 flex-row items-center gap-1 px-2 pb-1 pt-2">
      <Pressable
        testID={`${testID}-back`}
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack ?? goBackOrHome}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="arrow-back" size={20} color="#1f2937" />
      </Pressable>
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        variant="title"
        className="min-w-0 flex-1 text-xl"
        numberOfLines={2}
      >
        {title}
      </Text>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}
