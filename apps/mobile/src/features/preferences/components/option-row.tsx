import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

/** Shared selectable row — goal list, activity level, biological sex, etc. */
export function OptionRow({
  selected,
  onPress,
  icon,
  label,
  description,
  testID,
}: {
  selected: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border p-3',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
      )}
    >
      {icon && (
        <Ionicons name={icon} size={22} color={selected ? colors.brand : colors.labelTertiary} />
      )}
      <View className="min-w-0 flex-1">
        <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-label')}>
          {label}
        </Text>
        {description && (
          <Text variant="muted" className="text-xs">
            {description}
          </Text>
        )}
      </View>
      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
    </Pressable>
  );
}
