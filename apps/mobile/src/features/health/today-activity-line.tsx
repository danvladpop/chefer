import { View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { todayActivityLabel } from './health-model';
import { useTodayActivity } from './use-health-sync';

// C2: today's steps and active energy from the phone's health store — on the
// device only, never sent to Chefer and never added to food targets. Renders
// nothing until the user turns steps or active energy on.

export function TodayActivityLine() {
  const colors = useThemeColors();
  const activity = useTodayActivity();
  const label = activity ? todayActivityLabel(activity) : null;
  if (!label) return null;
  return (
    <View
      testID="today-health-activity"
      accessible
      accessibilityLabel={`Today so far: ${label}`}
      className="min-h-11 flex-row items-center gap-2 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <Icon name="activity" size={18} color={colors.labelSecondary} />
      <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{label}</Text>
    </View>
  );
}
