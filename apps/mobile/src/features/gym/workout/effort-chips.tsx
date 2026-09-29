import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChipGroup, Text } from '@chefer/ui-mobile';
import { EFFORT_CHIP_RPE, effortLabelForRpe, type EffortLabel } from '@chefer/utils';

// ─── Cardio effort input (T-42.3, 06 §2) ──────────────────────────────────────
// The wearable-less intensity input: three quick chips (RPE 3/5/7) cover most
// entries in one tap; "Exact effort ▸" expands to the full 1–10 scale for
// anyone who wants to be precise. AC11: text never below text-xs even at 1.8×.

const EFFORT_OPTIONS: readonly { value: EffortLabel; label: string }[] = [
  { value: 'Easy', label: 'Easy' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Hard', label: 'Hard' },
];

const EXACT_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

export interface EffortChipsProps {
  /** Current RPE (1–10), or undefined if no effort has been set yet. */
  value: number | undefined;
  onChange: (rpe: number | undefined) => void;
  testID?: string;
}

/** Easy/Moderate/Hard quick chips + an "Exact effort ▸" 1–10 expansion. */
export function EffortChips({ value, onChange, testID = 'cardio-effort' }: EffortChipsProps) {
  const quickLabel = value !== undefined ? effortLabelForRpe(value) : null;
  const [exactOpen, setExactOpen] = useState(false);

  return (
    <View className="gap-2" testID={testID}>
      <View className="flex-row flex-wrap items-center gap-2">
        <ChipGroup
          testID={`${testID}-quick`}
          options={EFFORT_OPTIONS}
          value={quickLabel && !exactOpen ? [quickLabel] : []}
          allowEmpty
          onChange={(next) => {
            setExactOpen(false);
            const label = next[0];
            onChange(label ? EFFORT_CHIP_RPE[label] : undefined);
          }}
        />
        <Pressable
          testID={`${testID}-exact-toggle`}
          accessibilityRole="button"
          accessibilityLabel="Exact effort, 1 to 10"
          accessibilityState={{ expanded: exactOpen }}
          onPress={() => setExactOpen((v) => !v)}
          className="min-h-11 justify-center px-2"
        >
          <Text className="text-sm font-medium text-primary">
            {exactOpen ? 'Hide exact ▴' : 'Exact effort ▸'}
          </Text>
        </Pressable>
      </View>
      {exactOpen ? (
        <ChipGroup
          testID={`${testID}-exact`}
          options={EXACT_OPTIONS}
          value={value !== undefined ? [value] : []}
          allowEmpty
          onChange={(next) => onChange(next[0])}
        />
      ) : null}
    </View>
  );
}
