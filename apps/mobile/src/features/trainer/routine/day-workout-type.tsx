import { View } from 'react-native';
import { COACHING_COPY } from '@chefer/types';
import { ListRow, ListSection, Text } from '@chefer/ui-mobile';
import { workoutTypeLabel } from '@chefer/utils';
import type { RoutineDayDraft } from '../../gym/routine/types';

// ─── A routine day's workout type, as the trainer sees it (PRD 2026-10 §4.3) ──
// A client who trains in "Keep it simple" plans their week as workout types ("Tue · Yoga"); a type-only
// day has no exercises. The trainer's editor shows the type on every day that has one and lets the
// trainer set or change it through My week's own picker (opened by the screen, one sheet for all days).

/** Picker label for "no type" (My week calls the same chip "Rest", which a routine day is not). */
export const NO_WORKOUT_TYPE_LABEL = COACHING_COPY.trainerProfile.workoutType.none;

export function isTypeOnlyDay(day: Pick<RoutineDayDraft, 'workoutType' | 'exercises'>): boolean {
  return Boolean(day.workoutType) && day.exercises.length === 0;
}

export function DayWorkoutType({
  day,
  clientName,
  onPress,
  testID,
}: {
  day: RoutineDayDraft;
  clientName: string;
  onPress: () => void;
  testID: string;
}) {
  const label = day.workoutType ? workoutTypeLabel(day.workoutType) : null;
  return (
    <View className="gap-1.5">
      <ListSection>
        <ListRow
          testID={testID}
          title={COACHING_COPY.trainerProfile.workoutType.label}
          value={label ?? NO_WORKOUT_TYPE_LABEL}
          accessibilityHint={COACHING_COPY.trainerProfile.workoutType.pickHint}
          onPress={onPress}
        />
      </ListSection>
      {label && isTypeOnlyDay(day) ? (
        <Text testID={`${testID}-type-only`} className="text-caption text-label-secondary">
          {COACHING_COPY.trainerProfile.workoutType.typeOnly(label, clientName)}
        </Text>
      ) : null}
    </View>
  );
}
