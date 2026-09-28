import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { todayStatus } from '@chefer/utils';
import { setMode } from '../mode-store';
import { localDate } from '../offline/ids';
import { useGymReminders } from '../reminders/use-gym-reminders';
import { weekdayLabel } from '../routine/weekday';
import { useActiveWorkout } from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';

// "Today's workout" dashboard card (UX-04 §5 "Workout card on Food Today",
// T-04.6): a link from Food into Gym. It reads only the persisted bootstrap —
// no gating on the current mode, so it renders in Food mode too — and never
// blocks the food dashboard's own loading state (renders nothing until the
// gym bootstrap has an answer). Three states share `todayStatus()` with Gym
// Today itself (bug B-15 companion), so the two surfaces can never disagree
// about whether today is done, a rest day, or still to do.
//
// It also hosts `useGymReminders()` (gym_plan.md §6.5): this card is the one
// gym-adjacent element always mounted for a signed-in user regardless of
// which mode they're in, so it's the natural second home for the reminder
// reschedule effect (the first is the gym Today tab itself).

const EYEBROW_TONIGHT_HOUR = 16;

export function TodaysWorkoutCard() {
  const { data: bootstrap } = useGymBootstrap();
  const activeWorkout = useActiveWorkout();
  useGymReminders();

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
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
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

  const today = localDate();
  const status = todayStatus({ bootstrap, today });
  const { nextWorkout } = bootstrap;

  if (status.kind === 'done') {
    return (
      <Pressable testID="todays-workout-card" accessibilityRole="button" onPress={goToGym}>
        <Card className="gap-0.5">
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Today&apos;s workout
          </Text>
          <Text testID="todays-workout-card-label" className="font-medium">
            {`Done today ✓ · Next: ${status.dayName} on ${weekdayLabel(status.weekday)}`}
          </Text>
        </Card>
      </Pressable>
    );
  }

  if (status.kind === 'rest') {
    return (
      <Card testID="todays-workout-card" className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Today&apos;s workout
        </Text>
        <Text testID="todays-workout-card-label" className="font-medium">
          {`Rest day · Next: ${status.dayName} on ${weekdayLabel(status.weekday)}`}
        </Text>
        <Pressable
          testID="todays-workout-card-train-anyway"
          accessibilityRole="button"
          onPress={goToGym}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm font-medium text-primary">Train anyway</Text>
        </Pressable>
      </Card>
    );
  }

  // 'training' with nothing planned at all (no routine day) — nothing useful to offer here.
  if (!nextWorkout) return null;

  const eyebrow =
    new Date().getHours() >= EYEBROW_TONIGHT_HOUR ? 'TRAINING TONIGHT' : 'TRAINING TODAY';
  const handleStart = () => {
    setMode('gym');
    activeWorkout.start({ kind: 'planned', workout: nextWorkout });
    router.push('/gym/workout');
  };

  return (
    <Card testID="todays-workout-card" className="gap-1">
      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        {eyebrow}
      </Text>
      <Text testID="todays-workout-card-label" className="font-medium">
        {nextWorkout.dayName}
      </Text>
      <Text variant="muted" className="text-xs">
        {`~${nextWorkout.estimatedMin} min · ${nextWorkout.exercises.length} exercises`}
      </Text>
      <Button testID="todays-workout-card-start" size="sm" className="mt-1" onPress={handleStart}>
        Start workout
      </Button>
    </Card>
  );
}
