import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendRoutineDto } from '@chefer/types';
import { EmptyState, Text, useReducedMotion } from '@chefer/ui-mobile';
import { DayCardView } from '../../../gym/routine/day-card-view';
import { formatRest, weekdayShort } from '../format';

// ─── FriendRoutineCard: another person's active routine, read-only (UX §10) ───
// `friends.routine` data through the owner's presentational `DayCardView`:
// days in order, `{day name} · {weekday}`, exercises with `{sets} × {min}–{max}
// · {m:ss}` (a11y `3 sets of 8–12 reps`), supersets bracketed. No progression
// weights, no override, no edit. Curated exercises open their library page;
// custom ones read `{name} (custom)`. More than 4 exercises → `Show all`
// (MO-05 layout transition).

/** UX §10: exercises shown per day before `Show all`. */
export const ROUTINE_DAY_PREVIEW = 4;

type Day = FriendRoutineDto['days'][number];

export function FriendRoutineCard({
  routine,
  firstName,
  testID = 'friends-routine',
}: {
  routine: FriendRoutineDto | null;
  firstName: string;
  testID?: string;
}) {
  if (!routine) {
    return (
      <EmptyState
        testID={`${testID}-empty`}
        icon={<Ionicons name="barbell-outline" size={40} color="#9ca3af" />}
        title={FRIENDS_COPY.gym.noRoutine(firstName)}
      />
    );
  }
  return (
    <View testID={testID} className="gap-3">
      <Text testID={`${testID}-name`} variant="heading">
        {routine.name}
      </Text>
      {routine.days.map((day) => (
        <FriendRoutineDay key={day.position} day={day} testID={`${testID}-day-${day.position}`} />
      ))}
    </View>
  );
}

function FriendRoutineDay({ day, testID }: { day: Day; testID: string }) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const collapsible = day.exercises.length > ROUTINE_DAY_PREVIEW;
  return (
    <Animated.View layout={reduced ? undefined : LinearTransition}>
      <DayCardView
        testID={testID}
        exerciseTestIDPrefix={`${testID}-exercise`}
        title={
          day.plannedWeekday === null
            ? day.name
            : FRIENDS_COPY.gym.routineDay(day.name, weekdayShort(day.plannedWeekday))
        }
        exercises={day.exercises.map((ex, i) => {
          const name = ex.isCustom ? `${ex.name} ${FRIENDS_COPY.gym.custom}` : ex.name;
          return {
            id: `${i}`,
            name,
            summary: `${ex.sets} × ${ex.repMin}–${ex.repMax} · ${formatRest(ex.restSec)}`,
            supersetGroup: ex.supersetGroup,
            restSec: ex.restSec,
            accessibilityLabel: `${name}, ${FRIENDS_COPY.gym.setsLabel(ex.sets, ex.repMin, ex.repMax)}`,
            ...(ex.isCustom
              ? {}
              : {
                  onPress: () =>
                    router.push({ pathname: '/gym/exercise/[id]', params: { id: ex.exerciseId } }),
                }),
          };
        })}
        {...(collapsible && !expanded ? { visibleCount: ROUTINE_DAY_PREVIEW } : {})}
        footer={
          collapsible && !expanded ? (
            <Pressable
              testID={`${testID}-show-all`}
              accessibilityRole="button"
              onPress={() => setExpanded(true)}
              className="min-h-11 flex-row items-center justify-end"
            >
              <Text className="text-sm font-semibold text-primary">{FRIENDS_COPY.gym.showAll}</Text>
            </Pressable>
          ) : null
        }
      />
    </Animated.View>
  );
}
