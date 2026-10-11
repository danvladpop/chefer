import { View } from 'react-native';
import { router } from 'expo-router';
import {
  IconButton,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../src/components/icon';
import { HouseholdEditor } from '../src/features/household/household-editor';

// Household (F2, backlog P2-3) — port of web's preferences household-section.
// Every tier adds, edits and removes members (their allergies apply to every
// plan; a free, empty table sees the ghost for the chip tapped, F-PM-12);
// scaling servings and the list to the table is premium. Reached from
// Profile → Household and More → Household.

export default function HouseholdScreen() {
  const colors = useThemeColors();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* The shell's pushed-page top bar (chevron Back + title1), drawn here
          to keep the household-title id the Maestro flows look for. */}
      <View className="min-h-11 flex-row items-center gap-1 px-4 py-2">
        <IconButton
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          className="-ml-2"
        />
        <Text
          testID="household-title"
          accessibilityRole="header"
          className="min-w-0 flex-1 text-title1 font-bold text-label"
          numberOfLines={1}
        >
          Household
        </Text>
      </View>

      {/* UX-X-05: the name field and "Add to household" stay clear of the keyboard. */}
      <KeyboardAwareScrollView
        testID="household-scroll"
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
      >
        <Text className="text-subhead text-label-secondary">
          Who eats with you? Everyone&apos;s allergies and restrictions apply to every plan, free.
          With Premium, portions, the shopping list and the week cost scale to your whole table.
        </Text>
        <HouseholdEditor />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
