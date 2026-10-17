import { View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';

/**
 * The new shell's header for `/preferences` ("Goals & diet", 10 Oct board
 * "Preferences"): the shell's chevron Back and a title1 title, like every
 * other pushed shell screen. Back falls back to You when there is no history
 * (a cold deep link).
 */
export function PreferencesHeaderV2({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center gap-1 px-4 py-2">
      <IconButton
        testID="preferences-back"
        accessibilityLabel="Back"
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
        className="-ml-2"
      />
      <Text
        testID="preferences-title"
        accessibilityRole="header"
        className="min-w-0 flex-1 text-title1 font-bold text-label"
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}
