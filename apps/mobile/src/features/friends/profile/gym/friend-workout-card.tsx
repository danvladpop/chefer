import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_COPY, type FriendWorkoutDto } from '@chefer/types';
import { Card, colors, duration, Text, useReducedMotion } from '@chefer/ui-mobile';
import { formatWeekdayDayMonth } from '../format';
import type { ViewerUnits } from '../use-viewer-units';
import { setLines, topSetLine } from './workout-format';

// ─── FriendWorkoutCard (UX §10, PRD FR-19.1) ──────────────────────────────────
// Collapsed: name, `{Ddd d MMM} · {n} min`, `{n} exercises`, and the top set
// per exercise in the viewer's units. `Show sets ▾` reveals every completed
// working set (MO-05 layout transition; a plain swap under reduced motion).
// Never shown (the DTO doesn't carry them): notes, heart rate, RPE, deloads,
// warm-ups.

export function FriendWorkoutCard({
  workout,
  units,
  testID,
}: {
  workout: FriendWorkoutDto;
  units: ViewerUnits;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const meta = [
    formatWeekdayDayMonth(workout.localDate),
    workout.durationMin !== null ? `${workout.durationMin} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View layout={reduced ? undefined : LinearTransition}>
      <Card testID={testID} className="gap-2">
        <View>
          <Text variant="heading" numberOfLines={2}>
            {workout.name}
          </Text>
          <Text testID={`${testID}-meta`} variant="muted">
            {meta}
          </Text>
          <Text variant="muted" className="text-xs">
            {FRIENDS_COPY.gym.exercises(workout.exercises.length)}
          </Text>
        </View>

        <View className="gap-1">
          {workout.exercises.map((ex, i) => (
            <View key={`${ex.exerciseId}-${i}`} testID={`${testID}-exercise-${i}`}>
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className="min-w-0 flex-1 font-medium" numberOfLines={2}>
                  {ex.isCustom ? `${ex.name} ${FRIENDS_COPY.gym.custom}` : ex.name}
                </Text>
                {!open ? (
                  <Text testID={`${testID}-exercise-${i}-top`} variant="muted" className="text-sm">
                    {topSetLine(ex, units)}
                  </Text>
                ) : null}
              </View>
              {open ? (
                <Animated.View
                  entering={reduced ? undefined : FadeIn.duration(duration.fast)}
                  className="gap-0.5 pl-2"
                >
                  {setLines(ex, units).map((line, k) => (
                    <Text
                      key={k}
                      testID={`${testID}-exercise-${i}-set-${k}`}
                      variant="muted"
                      className="text-sm"
                    >
                      {line}
                    </Text>
                  ))}
                </Animated.View>
              ) : null}
            </View>
          ))}
        </View>

        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          // Explicit: iOS would otherwise fold the chevron glyph into the label.
          accessibilityLabel={open ? FRIENDS_COPY.gym.hideSets : FRIENDS_COPY.gym.showSets}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          className="min-h-11 flex-row items-center justify-end gap-1"
        >
          <Text className="text-sm font-semibold text-primary">
            {open ? FRIENDS_COPY.gym.hideSets : FRIENDS_COPY.gym.showSets}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </Pressable>
      </Card>
    </Animated.View>
  );
}
