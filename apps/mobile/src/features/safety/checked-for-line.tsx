import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SafetyChecks } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import {
  cantCheckLine,
  checkedForLineText,
  cn,
  splitCheckedByVerification,
  taggedOnlyLineText,
} from '@chefer/utils';

// PAT-2 — "Checked for …" (UX-02 §2, T-02.2/T-02.3): the full-line form for
// recipe detail (under the tag chips) and cook mode (top of the ingredient
// list). Renders nothing when the table has no rules AND nothing to report —
// AC1 (T-02.3): the Checked element only ever appears when there is
// something to check. The caller is responsible for the "never both" rule
// (T-02.3 AC3): render the conflict banner instead of this line, not both.

export interface CheckedForLineProps {
  checks: Pick<SafetyChecks, 'checked' | 'unchecked'> & Partial<Pick<SafetyChecks, 'taggedOnly'>>;
  onPress?: () => void;
  testID?: string;
}

export function CheckedForLine({ checks, onPress, testID }: CheckedForLineProps) {
  const { unchecked } = checks;
  // UX-REC-01: a pass that rests on the recipe's tag alone is "Tagged … (not
  // verified)", never "Checked".
  const { verified: checked, taggedOnly } = splitCheckedByVerification(checks);
  if (checked.length === 0 && taggedOnly.length === 0 && unchecked.length === 0) return null;

  const mainLine = checked.length > 0 ? checkedForLineText(checked) : null;
  const a11yLabel = mainLine
    ? `${checkedForLineText(checked)}${onPress ? '. Opens details.' : ''}`
    : undefined;

  const content = (
    <View className="gap-1">
      {mainLine ? (
        <View className="min-w-0 flex-row items-start gap-1.5">
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color="#8a7560"
            accessible={false}
            style={{ marginTop: 1 }}
          />
          <Text testID={testID ? `${testID}-text` : undefined} className="min-w-0 flex-1 text-sm">
            {mainLine}
          </Text>
        </View>
      ) : null}
      {taggedOnly.length > 0 ? (
        <Text
          testID={testID ? `${testID}-tagged-only` : undefined}
          variant="muted"
          className={cn('text-xs text-amber-700', mainLine ? 'pl-[22px]' : '')}
        >
          {taggedOnlyLineText(taggedOnly)}
        </Text>
      ) : null}
      {unchecked.map((term) => (
        <Text key={term} variant="muted" className="pl-[22px] text-xs text-amber-700">
          {cantCheckLine(term)}
        </Text>
      ))}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={a11yLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      className={cn('min-h-11 justify-center py-1')}
    >
      {content}
    </Pressable>
  );
}
