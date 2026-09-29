import { View } from 'react-native';
import { ChipGroup, Text } from '@chefer/ui-mobile';
import { TIME_TODAY_OPTIONS } from '@chefer/utils';

// T-36.6 (UX-36 (6)): `Time today:` `20` `30` `45` `Full` above `Start
// workout`, and — when a shorter choice actually cuts the day — the preview
// `Short version · ~{min} min · {n} exercises`. Presentational: the screen
// owns the remembered choice (`time-today.ts`) and the trimmed workout.

/** ChipGroup values are strings/numbers; 0 stands for `Full`. */
const FULL = 0;

export interface ShortVersionPreview {
  minutes: number;
  exerciseCount: number;
}

interface TimeTodayChipsProps {
  /** Selected minutes; null = Full. */
  value: number | null;
  onChange: (minutes: number | null) => void;
  /** Set when the chosen time trims the day; null shows no preview line. */
  preview: ShortVersionPreview | null;
  testID?: string;
}

export function previewLine({ minutes, exerciseCount }: ShortVersionPreview): string {
  return `Short version · ~${String(minutes)} min · ${String(exerciseCount)} ${
    exerciseCount === 1 ? 'exercise' : 'exercises'
  }`;
}

export function TimeTodayChips({ value, onChange, preview, testID }: TimeTodayChipsProps) {
  return (
    <View testID={testID ?? 'gym-today-time'} className="gap-2">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Time available today"
        className="flex-row flex-wrap items-center gap-2"
      >
        <Text variant="muted" className="text-sm">
          Time today:
        </Text>
        <ChipGroup
          testID="gym-today-time-chips"
          options={[
            ...TIME_TODAY_OPTIONS.map((n) => ({
              value: n,
              label: String(n),
              testID: `gym-today-time-${String(n)}`,
            })),
            { value: FULL, label: 'Full', testID: 'gym-today-time-full' },
          ]}
          value={[value ?? FULL]}
          onChange={(v) => {
            const next = v[0];
            if (next !== undefined) onChange(next === FULL ? null : next);
          }}
        />
      </View>
      {preview ? (
        <Text testID="gym-today-short-preview" variant="muted" className="text-xs">
          {previewLine(preview)}
        </Text>
      ) : null}
    </View>
  );
}
