import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';

// The header row of every Following stack screen (the root Stack has
// `headerShown: false`; screens draw their own, as My weeks does): a 44 pt
// back button and the title as the screen's one heading.

export type FriendsScreenHeaderProps = {
  title: string;
  /** Trailing controls (the home's bell + gear). */
  right?: ReactNode;
  /** Defaults to `router.back()`. */
  onBack?: () => void;
  testID?: string;
};

export function FriendsScreenHeader({ title, right, onBack, testID }: FriendsScreenHeaderProps) {
  return (
    <View testID={testID} className="min-h-14 flex-row items-center gap-1 px-2 pb-1 pt-2">
      <Pressable
        testID={testID ? `${testID}-back` : undefined}
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack ?? (() => router.back())}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="arrow-back" size={20} color="#1f2937" />
      </Pressable>
      <Text
        testID={testID ? `${testID}-title` : undefined}
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
