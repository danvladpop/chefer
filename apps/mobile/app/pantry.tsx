import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen, Text } from '@chefer/ui-mobile';
import { PantryPanel } from '../src/features/pantry/pantry-panel';

// Pantry — kept for deep links. Day to day the pantry is the Shop tab's
// "In my kitchen" segment (P2-8); both render the same PantryPanel.
export default function PantryScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Your Kitchen
          </Text>
          <Text testID="pantry-title" variant="title">
            Pantry
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-8">
        <PantryPanel />
      </ScrollView>
    </Screen>
  );
}
