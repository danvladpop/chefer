import type { ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { cn, supersetRuns, supersetSlot } from '@chefer/utils';

// ─── DayCardView: one routine day, presentational ─────────────────────────────
// The day name + weekday line, an optional badge, then the exercises in
// order with their supersets bracketed (a `Superset A` header over the run,
// a violet rule and an `A1`/`A2` tag per member). It knows nothing about
// progressions, overrides or the gym bootstrap: the owner's Routine tab
// (`app/(gym)/routine.tsx`) passes each row's `Next:` line and the override
// press, and the Following Gym tab (`friends/profile/gym/friend-routine-card`)
// renders another person's routine read-only with it (UX §10).

export type DayCardViewExercise = {
  /** Row key and testID suffix (`{exerciseTestIDPrefix}-{id}`). */
  id: string;
  name: string;
  /** Trailing summary, e.g. `3 × 8–12` (the friend view adds `· 2:30`). */
  summary: string;
  supersetGroup: string | null;
  restSec: number;
  /** A line under the name (the owner's `Next:` target). */
  detail?: ReactNode;
  /** Makes the row a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
};

export type DayCardViewProps = {
  testID: string;
  /** Prefix of each exercise row's testID. */
  exerciseTestIDPrefix: string;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  exercises: readonly DayCardViewExercise[];
  /** Render only the first n exercises (the rest stays behind `footer`'s Show all). */
  visibleCount?: number;
  footer?: ReactNode;
  emptyText?: string;
};

export function DayCardView({
  testID,
  exerciseTestIDPrefix,
  title,
  subtitle,
  badge,
  exercises,
  visibleCount,
  footer,
  emptyText = 'No exercises yet.',
}: DayCardViewProps) {
  const runs = supersetRuns(exercises);
  const shown = visibleCount === undefined ? exercises : exercises.slice(0, visibleCount);
  return (
    <Card testID={testID}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="muted" className="text-xs">
            {subtitle}
          </Text>
        </View>
        {badge}
      </View>
      <View className="mt-3 gap-1">
        {shown.map((ex, i) => {
          const slot = supersetSlot(exercises, i);
          const run = slot?.position === 0 ? runs.find((r) => r.start === i) : undefined;
          const lastRest = run ? exercises[run.end]?.restSec : undefined;
          const rowTestID = `${exerciseTestIDPrefix}-${ex.id}`;
          return (
            <View key={ex.id} className="gap-1">
              {run && slot ? (
                <View
                  testID={`${testID}-superset-${slot.label}`}
                  className="flex-row items-center gap-2 pt-2"
                >
                  <Text className="text-sm font-semibold text-violet-800">
                    Superset {slot.label}
                  </Text>
                  <Text variant="muted" className="min-w-0 flex-1 text-xs" numberOfLines={1}>
                    {lastRest ?? ex.restSec} s rest after each round
                  </Text>
                </View>
              ) : null}
              <Pressable
                testID={rowTestID}
                accessibilityRole={ex.onPress ? 'button' : undefined}
                accessibilityLabel={ex.accessibilityLabel}
                disabled={!ex.onPress}
                onPress={ex.onPress}
                className={cn(
                  'min-h-11 justify-center gap-0.5 py-1',
                  slot && 'border-l-4 border-l-violet-500 pl-2',
                )}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                    {slot ? (
                      <View className="rounded bg-violet-100 px-1.5 py-0.5">
                        <RNText
                          testID={`${rowTestID}-superset`}
                          className="text-xs font-bold text-violet-800"
                        >
                          {slot.label}
                          {slot.position + 1}
                        </RNText>
                      </View>
                    ) : null}
                    <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
                      {ex.name}
                    </Text>
                  </View>
                  <Text variant="muted" className="text-xs">
                    {ex.summary}
                  </Text>
                </View>
                {ex.detail}
              </Pressable>
            </View>
          );
        })}
        {exercises.length === 0 ? (
          <Text variant="muted" className="text-sm">
            {emptyText}
          </Text>
        ) : null}
        {footer}
      </View>
    </Card>
  );
}
