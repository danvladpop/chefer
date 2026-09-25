import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen, Text } from '@chefer/ui-mobile';
import { ModeSwitch } from './mode-switch';

// Wave G1 placeholder for gym screens: a real, routable screen with a stable
// title testID so navigation and Maestro work before wave G2 fills the file.

export interface GymPlaceholderProps {
  title: string;
  /** testID of the title Text (Maestro anchors on it). */
  testID: string;
  description?: string;
  /** Tab-root screens show the Food | Gym switch; stack screens a Back button. */
  variant: 'tab' | 'stack';
  children?: React.ReactNode;
}

export function GymPlaceholder({
  title,
  testID,
  description,
  variant,
  children,
}: GymPlaceholderProps) {
  return (
    <Screen
      className="px-0"
      edges={variant === 'tab' ? undefined : ['top', 'bottom', 'left', 'right']}
    >
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        {variant === 'tab' ? (
          <ModeSwitch />
        ) : (
          <Pressable
            testID={`${testID}-back`}
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
            className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
          >
            <Ionicons name="chevron-back" size={22} color="#374151" />
          </Pressable>
        )}
        <View>
          <Text testID={testID} variant="title">
            {title}
          </Text>
          <Text variant="muted" className="mt-1">
            {description ?? 'Coming soon.'}
          </Text>
        </View>
        {children}
      </ScrollView>
    </Screen>
  );
}
