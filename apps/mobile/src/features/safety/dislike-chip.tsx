import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// PAT-2 — DislikeChip (UX-01 (c)): dislikes are soft in search/Discover
// (T-01.2) — a recipe with a disliked item stays in the results but carries
// this chip instead of being hard-excluded, unlike Replace/generation.

export interface DislikeChipProps {
  label: string;
  testID?: string;
}

export function DislikeChip({ label, testID }: DislikeChipProps) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      accessibilityLabel={`Contains ${label}, which you dislike`}
      className={cn(
        'min-h-6 flex-row items-center gap-1 self-start rounded-full bg-attention/10 px-2 py-0.5',
      )}
    >
      <Ionicons name="thumbs-down-outline" size={11} color={colors.attention} accessible={false} />
      <Text className="text-xs font-medium text-attention">{label}</Text>
    </View>
  );
}
