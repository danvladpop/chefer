import { View } from 'react-native';
import { COACHING_COPY } from '@chefer/types';
import { IconButton, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';

// One coaching notice as a quiet card (PRD 2026-10 §4.2): an icon, the line, an optional second line
// (the routine changes), an optional View and a Dismiss. Shared by the client's notices (Train, Today,
// the old Gym Today) and the trainer's (Trainer tools home).

export function NoticeCard({
  testID,
  title,
  detail,
  icon = 'yourTrainer',
  tone = 'plain',
  onView,
  viewLabel = COACHING_COPY.notices.view,
  onDismiss,
}: {
  testID: string;
  title: string;
  /** "+ Romanian deadlift · Squat 3×8 → 4×6 · note on Bench press". */
  detail?: string | null;
  icon?: IconName;
  /** `brand` for news that asks for a look (a routine change), `plain` for the rest. */
  tone?: 'brand' | 'plain';
  onView?: () => void;
  /** The inline action's label (default "View"); lane K3's check-in says "Answer". */
  viewLabel?: string;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      className={cn(
        'min-w-0 flex-row items-start gap-2 rounded-card py-2 pl-3 pr-1',
        tone === 'brand' ? 'bg-brand-tint' : 'border border-separator bg-surface',
      )}
    >
      <View className="min-h-11 justify-center">
        <Icon
          name={icon}
          color={tone === 'brand' ? colors.brand : colors.labelSecondary}
          size={18}
        />
      </View>
      <View className="min-w-0 flex-1 justify-center py-2.5">
        <Text
          testID={`${testID}-title`}
          className={cn(
            'text-subhead',
            tone === 'brand' ? 'font-semibold text-label' : 'text-label-secondary',
          )}
        >
          {title}
        </Text>
        {detail ? (
          <Text testID={`${testID}-detail`} className="mt-0.5 text-subhead text-label-secondary">
            {detail}
          </Text>
        ) : null}
        {onView ? (
          // MO-01: press feedback on the inline action.
          <PressableScale
            testID={`${testID}-view`}
            accessibilityRole="button"
            accessibilityLabel={`${viewLabel}: ${title}`}
            onPress={onView}
            className="min-h-11 justify-center self-start"
          >
            <Text className="text-subhead font-semibold text-brand">{viewLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
      <IconButton
        testID={`${testID}-dismiss`}
        accessibilityLabel={`${COACHING_COPY.notices.dismiss}: ${title}`}
        icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
        onPress={onDismiss}
      />
    </View>
  );
}
