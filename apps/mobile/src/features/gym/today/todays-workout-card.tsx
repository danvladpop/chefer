import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card, ProgressRing, Text } from '@chefer/ui-mobile';
import { setMode } from '../mode-store';
import { useGymBootstrap } from '../use-gym-bootstrap';

// "Today's workout" dashboard card (gym_plan.md D11, §1.3 "Food dashboard
// card"): a link from Food into Gym. It reads only the persisted bootstrap —
// no gating on the current mode, so it renders in Food mode too — and never
// blocks the food dashboard's own loading state (renders nothing until the
// gym bootstrap has an answer).

export function TodaysWorkoutCard() {
  const { data: bootstrap } = useGymBootstrap();

  if (!bootstrap) return null;

  const goToGym = () => {
    setMode('gym');
    router.push('/today');
  };

  if (!bootstrap.profile) {
    return (
      <Pressable testID="todays-workout-card" accessibilityRole="button" onPress={goToGym}>
        <Card className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Training
            </Text>
            <Text testID="todays-workout-card-label" className="mt-0.5 font-medium">
              Start training — set up in 90 seconds
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  }

  const { streak, nextWorkout } = bootstrap;
  const ringProgress = streak.thisWeekGoal > 0 ? streak.thisWeekSessions / streak.thisWeekGoal : 0;
  const label = nextWorkout
    ? nextWorkout.dayName
    : streak.thisWeekSessions >= streak.thisWeekGoal
      ? 'Done ✓'
      : 'Rest day';

  return (
    <Pressable testID="todays-workout-card" accessibilityRole="button" onPress={goToGym}>
      <Card className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Today&apos;s workout
          </Text>
          <Text testID="todays-workout-card-label" className="mt-0.5 font-medium">
            {label}
          </Text>
        </View>
        <ProgressRing
          progress={ringProgress}
          size={40}
          strokeWidth={4}
          testID="todays-workout-card-ring"
          accessibilityLabel={`${streak.thisWeekSessions} of ${streak.thisWeekGoal} this week`}
        >
          <Text className="text-[10px] font-semibold">
            {streak.thisWeekSessions}/{streak.thisWeekGoal}
          </Text>
        </ProgressRing>
      </Card>
    </Pressable>
  );
}
