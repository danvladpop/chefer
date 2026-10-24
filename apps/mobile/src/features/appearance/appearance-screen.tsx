import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { ListRow, ListSection, Screen, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { track } from '../../lib/analytics';
import { ShellChromeProvider, ShellTopBar } from '../shell/shell-chrome';
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  setAppearance,
  useAppearance,
  type AppearanceMode,
} from './appearance-store';

// You › Appearance: Automatic · Day · Night, one checked row (the iOS
// Settings "Appearance" shape). The choice applies at once — the screen
// itself is the preview.

const SUBTITLES: Record<AppearanceMode, string> = {
  system: "Matches your phone's light or dark setting",
  light: 'Always light',
  dark: 'Always dark, easier on the eyes at night',
};

export function AppearanceScreen() {
  const mode = useAppearance();
  const colors = useThemeColors();

  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/you', title: 'Appearance' }}>
      <Screen className="bg-canvas px-0">
        <View testID="appearance-header" className="px-4">
          <ShellTopBar />
        </View>
        <ScrollView testID="appearance-scroll" contentContainerClassName="gap-6 px-4 pb-8 pt-2">
          <ListSection footer="Saved on this phone.">
            {APPEARANCE_MODES.map((option) => (
              <ListRow
                key={option}
                testID={`appearance-${option}`}
                title={APPEARANCE_LABELS[option]}
                subtitle={SUBTITLES[option]}
                accessory={
                  option === mode ? (
                    <Icon name="checkmark" color={colors.brand} />
                  ) : (
                    <View className="w-[22px]" />
                  )
                }
                accessibilityHint={
                  option === mode ? `Selected. ${SUBTITLES[option]}` : SUBTITLES[option]
                }
                onPress={() => {
                  if (option === mode) return;
                  track('appearance_changed', { mode: option });
                  setAppearance(option);
                }}
              />
            ))}
          </ListSection>
        </ScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}

/** The You › Settings row: "Appearance  Automatic ›". */
export function AppearanceRow({ testID = 'you-appearance' }: { testID?: string }) {
  const mode = useAppearance();
  const colors = useThemeColors();
  return (
    <ListRow
      testID={testID}
      title="Appearance"
      value={APPEARANCE_LABELS[mode]}
      icon={<Icon name="appearance" color={colors.brand} />}
      onPress={() => router.push('/settings/appearance')}
    />
  );
}
