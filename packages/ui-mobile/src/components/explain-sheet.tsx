import { View } from 'react-native';
import { Button } from './button';
import { Sheet } from './sheet';
import { Text } from './text';

export interface ExplainSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Small uppercase line above the title, e.g. `Why this target`. */
  eyebrow?: string | undefined;
  title: string;
  /**
   * One plain-English paragraph naming the user's own inputs — the answer.
   * Omitted (not just empty) while the thing being explained isn't loaded
   * yet — no sentence renders at all, rather than an empty one.
   */
  sentence?: string;
  /** The inputs the sentence names, most-relevant last. */
  rows: { label: string; value: string }[];
  /** Muted line under the rows, e.g. how to change the input. */
  footnote?: string;
  /** Outline button in the Sheet footer. Changes the input — never an upsell. */
  action?: { label: string; onPress: () => void };
  /** Children get `${testID}-sentence`; the Sheet gets `-title` / `-close`. */
  testID?: string | undefined;
}

/**
 * PAT-1 — the food-side (and gym) "Why?" sheet: generalises the gym
 * `WhySheet` (D2, protected — see gym-why-sheet.test.tsx) so any explainable
 * number in the app (a target, a price, a safety check) explains itself the
 * same way. The `sentence` names the user's own inputs, never a formula; the
 * `rows` are the inputs it names; `action`, if given, changes an input
 * ("Change your goal") and must never upsell (technical-plan.md §2.1).
 */
export function ExplainSheet({
  visible,
  onClose,
  eyebrow,
  title,
  sentence,
  rows,
  footnote,
  action,
  testID,
}: ExplainSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      testID={testID}
      footer={
        action ? (
          <Button variant="outline" onPress={action.onPress}>
            {action.label}
          </Button>
        ) : undefined
      }
    >
      {sentence !== undefined ? (
        <Text testID={testID ? `${testID}-sentence` : undefined} className="text-base">
          {sentence}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View className="gap-2">
          {rows.map((row) => (
            <View
              key={row.label}
              className="flex-row justify-between gap-3 border-b border-border py-2"
            >
              <Text variant="muted">{row.label}</Text>
              <Text className="min-w-0 flex-1 text-right text-sm font-medium">{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {footnote ? (
        <Text variant="muted" className="text-xs">
          {footnote}
        </Text>
      ) : null}
    </Sheet>
  );
}
