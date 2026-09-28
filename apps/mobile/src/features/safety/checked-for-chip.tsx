import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { checkedForChipA11yLabel, checkedForChipText, cn } from '@chefer/utils';

// PAT-2 — "Checked for {n}" (UX-02 §3, T-02.2): the compact form for plan
// meal cards, Today hero/Tonight cards, Replace-sheet rows and Discover
// cards. Only rendered by the caller when the table has ≥ 1 safety item —
// this component itself just needs the labels to build the count + the
// spelled-out a11y label.

export interface CheckedForChipProps {
  /** The rule labels this recipe was checked against and passed (or kept as a note). */
  labels: readonly string[];
  testID?: string;
}

export function CheckedForChip({ labels, testID }: CheckedForChipProps) {
  if (labels.length === 0) return null;
  return (
    <View
      testID={testID}
      accessibilityLabel={checkedForChipA11yLabel(labels)}
      className={cn(
        'min-h-6 flex-row items-center gap-1 self-start rounded-full bg-accent px-2 py-0.5',
      )}
    >
      <Ionicons name="shield-checkmark-outline" size={11} color="#944a00" accessible={false} />
      <Text className="text-xs font-medium text-primary">{checkedForChipText(labels.length)}</Text>
    </View>
  );
}
