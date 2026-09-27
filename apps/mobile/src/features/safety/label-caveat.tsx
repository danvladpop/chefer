import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// PAT-2 — safety states, "Label caveat" (technical-plan.md / synthesis
// 03-ux-design-spec.md §2.2): the risk sits in a bought product (stock,
// oats, soy sauce, curry powder, baking powder, chocolate) — the ingredient
// is kept, but flagged. `compact` is the inline ingredient-line form
// ("Buy certified gluten-free"); the full form sits under the Checked line
// ("Check the label: certified GF stock and oats").

export interface LabelCaveatProps {
  text: string;
  /** Inline, on the ingredient line itself. Default: a full-width row. */
  compact?: boolean;
  testID?: string;
}

export function LabelCaveat({ text, compact = false, testID }: LabelCaveatProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={text}
      className={cn(
        'flex-row items-center gap-1',
        compact ? 'self-start' : 'w-full items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2',
      )}
    >
      <Ionicons
        name="alert-circle-outline"
        size={compact ? 12 : 14}
        color="#92400e"
        style={compact ? undefined : { marginTop: 1 }}
      />
      <Text
        numberOfLines={compact ? 1 : undefined}
        className={cn('min-w-0 flex-1 text-amber-800', compact ? 'text-xs font-medium' : 'text-xs')}
      >
        {text}
      </Text>
    </View>
  );
}
