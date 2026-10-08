import { Pressable, useWindowDimensions, View } from 'react-native';
import type { DayKind } from '@chefer/types';
import { Chip, ChipGroup, Text } from '@chefer/ui-mobile';
import { ONBOARDING_COPY } from './copy';

// Step — Training days (UX-03, T-03.3/T-03.9; Train + any food job only).
// The answer is shared by both halves: it pre-fills gym setup's step 1
// (count) and step 4 (weekdays), and it also tells the food side which
// days get more food planned. The day-kind row (T-03.9, UX-06) lets an
// endurance athlete's long-run day count as a training day for food
// without being a gym day.

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "0 days a week", "1 day a week" (UX-ONB-10: it used to read "1 days"). */
export function trainingDaysCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'} a week`;
}

const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const KIND_OPTIONS: { value: Exclude<DayKind, 'lift' | 'rest'>; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'long_run', label: 'Long run' },
];

/** This step only ever sets 'run'/'long_run' — 'rest' and 'lift' come from elsewhere (UX-06). */
export type TrainingDayKind = Exclude<DayKind, 'lift' | 'rest'>;

export interface TrainingDaysStepProps {
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  /** Weekday (0=Mon…6=Sun) -> kind, only for entries the user set explicitly. */
  dayKinds: Record<number, TrainingDayKind>;
  onDayKindsChange: (dayKinds: Record<number, TrainingDayKind>) => void;
  /** "Not sure yet" — skips the question; gym setup will ask instead. */
  onNotSure: () => void;
}

export function TrainingDaysStep({
  weekdays,
  onWeekdaysChange,
  dayKinds,
  onDayKindsChange,
  onNotSure,
}: TrainingDaysStepProps) {
  const sorted = [...weekdays].sort((a, b) => a - b);
  // Seven 44 pt chips + gaps inside the screen's 16 pt side padding.
  const { width } = useWindowDimensions();
  const singleRow = width - 32 >= 7 * 44 + 6 * 2;

  function withoutDay(weekday: number): Record<number, TrainingDayKind> {
    return Object.fromEntries(Object.entries(dayKinds).filter(([w]) => Number(w) !== weekday));
  }

  function setKind(weekday: number, kind: Exclude<DayKind, 'lift' | 'rest'>) {
    const current = dayKinds[weekday];
    // Tapping the selected chip clears it back to the Lift default.
    onDayKindsChange(current === kind ? withoutDay(weekday) : { ...dayKinds, [weekday]: kind });
  }

  return (
    <View className="gap-4">
      <Text variant="muted" className="text-sm">
        {ONBOARDING_COPY.trainingDaysHelper}
      </Text>
      {/* UX-ONB-10: one equal-width row of seven — in a wrapping ChipGroup "Sun" sat
          alone on a second line. When the screen is too narrow for seven 44 pt
          chips it is 4 + 3 instead, never 6 + 1. */}
      <View testID="training-days-weekdays" className="gap-0.5">
        {(singleRow ? [WEEKDAY_LABELS] : [WEEKDAY_LABELS.slice(0, 4), WEEKDAY_LABELS.slice(4)]).map(
          (row) => (
            <View key={row[0]} className="flex-row gap-0.5">
              {row.map((label) => {
                const value = WEEKDAY_LABELS.indexOf(label);
                return (
                  <Chip
                    key={label}
                    testID={`training-days-${value}`}
                    label={label}
                    selected={weekdays.includes(value)}
                    className="min-w-11 flex-1 px-0"
                    onPress={() =>
                      onWeekdaysChange(
                        weekdays.includes(value)
                          ? weekdays.filter((d) => d !== value)
                          : [...weekdays, value],
                      )
                    }
                  />
                );
              })}
            </View>
          ),
        )}
      </View>
      <Text testID="training-days-count" variant="muted" className="text-sm">
        {trainingDaysCountLabel(weekdays.length)}
      </Text>

      {sorted.length > 0 && (
        <View className="gap-3 border-t border-border pt-3">
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {ONBOARDING_COPY.trainingDaysRunQuestion}
          </Text>
          {sorted.map((weekday) => (
            <View key={weekday} className="gap-1.5">
              <Text className="text-sm text-gray-700">{WEEKDAY_FULL[weekday]}</Text>
              <ChipGroup
                testID={`training-days-kind-${weekday}`}
                options={KIND_OPTIONS}
                value={dayKinds[weekday] ? [dayKinds[weekday]] : []}
                allowEmpty
                onChange={(vals) => {
                  const picked = vals[0];
                  if (picked) setKind(weekday, picked);
                  else onDayKindsChange(withoutDay(weekday));
                }}
              />
            </View>
          ))}
        </View>
      )}

      <Pressable
        testID="training-days-not-sure"
        accessibilityRole="button"
        onPress={onNotSure}
        className="h-11 items-center justify-center"
      >
        <Text className="text-sm font-semibold text-primary">
          {ONBOARDING_COPY.trainingDaysNotSure}
        </Text>
      </Pressable>
    </View>
  );
}
