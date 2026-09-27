import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// PAT-2 — safety states, "Filtered for" row (technical-plan.md / synthesis
// 03-ux-design-spec.md §2.2): sits at the top of any list a safety filter
// shortened (Discover, Replace, cookbook search, AI Chef ideas). Tapping it
// opens the "What we check" sheet — this component only renders the line
// and forwards the tap; the caller wires `onPress`.

export interface FilteredForLineProps {
  /** e.g. "vegan + gluten-free". */
  filters: string;
  hiddenCount: number;
  onPress?: () => void;
  testID?: string;
}

export function FilteredForLine({ filters, hiddenCount, onPress, testID }: FilteredForLineProps) {
  const label = `Filtered for ${filters} · ${hiddenCount} hidden`;
  const content = (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Ionicons name="funnel-outline" size={14} color="#8a7560" />
      <Text variant="muted" className="min-w-0 flex-1 text-xs">
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={label} className="py-1.5">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn('min-h-11 flex-row items-center py-1.5')}
    >
      {content}
    </Pressable>
  );
}
