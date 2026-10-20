import { View } from 'react-native';
import { haptics, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon } from '../../../components/icon';

// A multi-select row for the template sheets (pick clients, pick who to update): the whole row is the
// 44 pt checkbox, with a title and an optional detail line.

export function CheckRow({
  testID,
  title,
  detail,
  checked,
  disabled = false,
  onToggle,
}: {
  testID: string;
  title: string;
  detail?: string | null;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  return (
    // MO-01: press feedback on the row.
    <PressableScale
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onToggle();
      }}
      className={cn(
        'min-h-14 flex-row items-center gap-3 rounded-control border border-separator bg-surface px-4 py-2',
        disabled && 'opacity-50',
      )}
    >
      <View
        className={cn(
          'h-6 w-6 items-center justify-center rounded-full border-2',
          checked ? 'border-brand bg-brand' : 'border-separator bg-surface',
        )}
      >
        {checked ? <Icon name="checkmark" color={colors.onBrand} size={16} /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-headline font-semibold text-label" numberOfLines={2}>
          {title}
        </Text>
        {detail ? <Text className="text-caption text-label-secondary">{detail}</Text> : null}
      </View>
    </PressableScale>
  );
}
