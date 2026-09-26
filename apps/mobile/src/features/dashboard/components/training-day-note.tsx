import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { TrainingDayNutrition } from '@chefer/types';
import { colors, Text } from '@chefer/ui-mobile';
import { cn, trainingDayLine } from '@chefer/utils';

/**
 * Training-aware nutrition (audit P2-4), mirrors web's TrainingDayNote and is
 * shared by Today (nutrition summary) and the tracker: on a lifter's training
 * day, premium sees the bump applied to the targets; free sees the same
 * numbers locked, with the upgrade path (Profile).
 *
 * `isToday` = false on the tracker's other days: the copy then says "this
 * day" instead of "today".
 */
export function TrainingDayNote({
  t,
  isToday = true,
  className,
}: {
  t: TrainingDayNutrition;
  isToday?: boolean;
  className?: string;
}) {
  if (!t.isTrainingDay) return null;
  const workout = t.workoutName ?? 'Your workout';
  const when = t.reason === 'COMPLETED' ? 'done' : isToday ? 'today' : 'planned';
  const day = isToday ? 'today' : 'this day';
  return (
    <View
      testID="training-day"
      className={cn(
        'mb-4 rounded-xl px-3 py-2.5',
        t.applied ? 'bg-accent' : 'border border-dashed border-gray-300 bg-gray-50',
        className,
      )}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons
          name="barbell-outline"
          size={16}
          color={t.applied ? colors.primary : colors.mutedForeground}
        />
        <Text
          testID="training-day-line"
          className={cn(
            'min-w-0 flex-1 text-xs font-semibold',
            t.applied ? 'text-primary' : 'text-gray-700',
          )}
        >
          {trainingDayLine(t)}
        </Text>
      </View>
      {t.applied ? (
        <Text className="mt-0.5 text-xs text-primary/80">
          {workout} {when} · protein at {t.basis.trainingDayProteinGPerKg} g/kg, added to {day}
        </Text>
      ) : (
        <>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
            <Text className="min-w-0 flex-1 text-xs text-gray-600">
              Premium adds this to {day}&apos;s targets
            </Text>
          </View>
          <Pressable
            testID="training-day-upgrade"
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/profile', params: { source: 'training-day' } })
            }
            className="min-h-11 justify-center"
          >
            <Text className="text-xs font-semibold text-primary">Upgrade from your Profile →</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
