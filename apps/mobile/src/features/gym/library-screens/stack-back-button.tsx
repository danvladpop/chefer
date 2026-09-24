import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// Manual back button for gym stack routes: the root Stack sets
// `headerShown: false` globally (app/_layout.tsx), so every stack screen
// draws its own — same look as GymPlaceholder's, kept here so the real G2-D
// screens (which replace GymPlaceholder) stay visually consistent with the
// rest of the gym stack.
export function StackBackButton({
  testID,
  fallback = '/today',
}: {
  testID: string;
  fallback?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
    >
      <Ionicons name="chevron-back" size={22} color="#374151" />
    </Pressable>
  );
}
