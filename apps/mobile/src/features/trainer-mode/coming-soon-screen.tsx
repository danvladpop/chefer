import { View } from 'react-native';
import { EmptyState, Screen, useThemeColors } from '@chefer/ui-mobile';
import { Icon, type IconName } from '../../components/icon';
import { ShellTopBar } from '../shell/shell-chrome';

// Schedule (M3) and Workouts (M2) in M1 (trainer-mode.md §13): the tab and
// its one title are there, with what is coming. `trainerMode` stays off in
// prod until M3, so only testers see these.

export function ComingSoonScreen({
  testID,
  icon,
  title,
  body,
}: {
  testID: string;
  icon: IconName;
  title: string;
  body: string;
}) {
  const colors = useThemeColors();
  return (
    <Screen className="bg-canvas px-0" testID={testID}>
      <View className="flex-1 px-4 pt-3">
        <ShellTopBar />
        <EmptyState
          testID={`${testID}-coming-soon`}
          icon={<Icon name={icon} color={colors.labelTertiary} size={40} />}
          title={title}
          description={body}
          className="flex-1"
        />
      </View>
    </Screen>
  );
}
