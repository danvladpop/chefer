import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';

// Category header row on the Shop tab ("To buy"). Extracted from
// app/(food)/shopping-list.tsx for bug B-28 (T-BUG-28): ticking an item
// visibly shifted every row below it, even though no row's own height
// changes when it's checked (stable keys, no sort-by-checked, no
// LayoutAnimation — already ruled out). The REAL cause: this row's own
// label text grows every tick ("3 items" → "3 items · 1 done"), and it had
// no `min-w-0`/`numberOfLines` on a Text flex child inside a `justify-between`
// row (CLAUDE.md's documented #1 overflow cause) — past a certain width or
// text-scale it wrapped onto a second line, which changed THIS row's height
// and reflowed every category and item below it in the (non-virtualized)
// ScrollView, on every tick, not only when the "✓ all" badge appears.
// Fix: cap the label to one line and let it truncate instead of wrap, so
// this row's height never depends on how long its count text is.

export interface CategoryHeaderProps {
  testID: string;
  label: string;
  itemCount: number;
  doneCount: number;
  expanded: boolean;
  onPress: () => void;
}

export function CategoryHeader({
  testID,
  label,
  itemCount,
  doneCount,
  expanded,
  onPress,
}: CategoryHeaderProps) {
  const allDone = doneCount === itemCount && itemCount > 0;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      className="mb-2 min-h-11 flex-row items-center justify-between gap-2 px-1"
    >
      <Text
        testID={`${testID}-label`}
        numberOfLines={1}
        className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-widest text-gray-500"
      >
        {label}{' '}
        <Text className="text-xs font-normal normal-case text-gray-500">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
          {doneCount > 0 ? ` · ${doneCount} done` : ''}
        </Text>
      </Text>
      <View className="flex-shrink-0 flex-row items-center gap-2">
        {allDone && (
          <View className="rounded-full bg-emerald-100 px-2 py-0.5">
            <Text className="text-[12px] font-bold text-emerald-700">✓ all</Text>
          </View>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </View>
    </Pressable>
  );
}
