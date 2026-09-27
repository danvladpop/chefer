import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';

// PAT-3 — the source-aware premium sheet (technical-plan.md §2.3). UI shell
// only (T-00.16): opened by every lock, nudge and the Profile plan card with
// a `source`; L-MONEY supplies the copy (headline/bullets/alsoIncluded/terms
// from the premium-pitch table, T-00.6) and wires `onTurnOnPremium` to the
// real upgrade mutation and the post-upgrade hand-over.

export interface PremiumSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Existing upgrade-source string — handed back to `onTurnOnPremium`. */
  source: string;
  /** The job headline this sheet was opened for. */
  headline: string;
  /** Three job-specific bullets. */
  bullets: string[];
  /** Collapsed "Also included" list. */
  alsoIncluded: string[];
  /** Plain-language beta terms paragraph. */
  termsText: string;
  onTurnOnPremium: (source: string) => void;
  turnOnLabel?: string;
  testID?: string;
}

export function PremiumSheet({
  visible,
  onClose,
  source,
  headline,
  bullets,
  alsoIncluded,
  termsText,
  onTurnOnPremium,
  turnOnLabel = 'Turn on Premium',
  testID,
}: PremiumSheetProps) {
  const [alsoIncludedOpen, setAlsoIncludedOpen] = useState(false);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={headline}
      eyebrow="Premium"
      maxHeight="90%"
      testID={testID}
      footer={
        <View className="gap-2">
          <Button
            testID={testID ? `${testID}-turn-on` : undefined}
            onPress={() => onTurnOnPremium(source)}
          >
            {turnOnLabel}
          </Button>
          <Button
            testID={testID ? `${testID}-not-now` : undefined}
            variant="outline"
            onPress={onClose}
          >
            Not now
          </Button>
        </View>
      }
    >
      <View className="gap-2">
        {bullets.map((bullet) => (
          <View key={bullet} className="flex-row items-start gap-2">
            <Text className="text-primary">{'•'}</Text>
            <Text className="min-w-0 flex-1 text-sm">{bullet}</Text>
          </View>
        ))}
      </View>

      <Pressable
        testID={testID ? `${testID}-also-included-toggle` : undefined}
        accessibilityRole="button"
        accessibilityState={{ expanded: alsoIncludedOpen }}
        onPress={() => setAlsoIncludedOpen((v) => !v)}
        className="min-h-11 flex-row items-center justify-between"
      >
        <Text className="text-sm font-medium">Also included</Text>
        <Text variant="muted" className="text-sm">
          {alsoIncludedOpen ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
      {alsoIncludedOpen ? (
        <View testID={testID ? `${testID}-also-included` : undefined} className="gap-1">
          {alsoIncluded.map((item) => (
            <View key={item} className="flex-row items-start gap-2">
              <Text variant="muted" className="text-sm">
                {'•'}
              </Text>
              <Text variant="muted" className="min-w-0 flex-1 text-sm">
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text variant="muted" className="text-xs">
        {termsText}
      </Text>
    </Sheet>
  );
}
