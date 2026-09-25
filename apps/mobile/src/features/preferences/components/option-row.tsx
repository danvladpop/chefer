import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
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
  icon?: string;
  label: string;
  description?: string;
  testID?: string;
}) {
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
      {icon && <Text className="text-xl">{icon}</Text>}
      <View className="min-w-0 flex-1">
        <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-gray-800')}>
          {label}
        </Text>
        {description && (
          <Text variant="muted" className="text-xs">
            {description}
          </Text>
        )}
      </View>
      {selected && <Ionicons name="checkmark-circle" size={20} color="#944a00" />}
    </Pressable>
  );
}
