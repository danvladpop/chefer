import { Pressable, View } from 'react-native';
import { TRAINER_MODE_COPY, type AppShellMode } from '@chefer/types';
import { CountPill, ListSection, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { switchShellMode } from './switch-mode';

// The first row of You in both modes (trainer-mode.md §5.1): "Switch to
// trainer mode" / "Switch to personal mode", with a badge for what is waiting
// in the other mode. Drawn like a ListRow, but the row speaks its count
// ("Switch to trainer mode, 2 things waiting") — ListRow's label is its title.

/** The row's spoken name: the action, then what is waiting there. */
export function modeSwitchLabel(to: AppShellMode, waiting: number): string {
  const title =
    to === 'trainer'
      ? TRAINER_MODE_COPY.mode.switchToTrainer
      : TRAINER_MODE_COPY.mode.switchToPersonal;
  return waiting > 0 ? `${title}, ${TRAINER_MODE_COPY.mode.waiting(waiting)}` : title;
}

export function ModeSwitchSection({
  to,
  waiting,
  testID,
}: {
  to: AppShellMode;
  waiting: number;
  testID: string;
}) {
  const colors = useThemeColors();
  const title =
    to === 'trainer'
      ? TRAINER_MODE_COPY.mode.switchToTrainer
      : TRAINER_MODE_COPY.mode.switchToPersonal;
  return (
    <ListSection>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={modeSwitchLabel(to, waiting)}
        // The selection tick is the switch's own light haptic (switchShellMode).
        onPress={() => switchShellMode(to)}
        style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSunken } : undefined)}
      >
        <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
          <View className="w-7 items-center">
            <Icon name="switchMode" color={colors.brand} />
          </View>
          <Text className="min-w-0 flex-1 text-body font-semibold text-label" numberOfLines={2}>
            {title}
          </Text>
          {waiting > 0 ? <CountPill count={waiting} testID={`${testID}-badge`} /> : null}
          <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
        </View>
      </Pressable>
    </ListSection>
  );
}
