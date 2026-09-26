import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen, Text } from '@chefer/ui-mobile';
import { HouseholdEditor } from '../src/features/household/household-editor';

// Household (F2, backlog P2-3) — port of web's preferences household-section.
// Every tier adds, edits and removes members (their allergies apply to every
// plan; a free, empty table sees the ghost for the chip tapped, F-PM-12);
// scaling servings and the list to the table is premium. Reached from
// Profile → Household and More → Household.

export default function HouseholdScreen() {
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
        <Text testID="household-title" variant="title">
          Household
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8" keyboardShouldPersistTaps="handled">
        <Text variant="muted" className="text-sm">
          Who eats with you? Everyone&apos;s allergies and restrictions apply to every plan, free.
          With Premium, portions, the shopping list and the week cost scale to your whole table.
        </Text>
        <HouseholdEditor />
      </ScrollView>
    </Screen>
  );
}
