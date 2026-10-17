import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, WorkoutType } from '@chefer/types';
import {
  ListRow,
  ListSection,
  PressableScale,
  ProgressRing,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { routineDayLabel, simpleToday, workoutTypeLabel } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { LogWorkoutSheet } from '../../shell/log-workout-sheet';
import { TrainButton } from '../../shell/train/train-button';
import { TrainCard } from '../../shell/train/train-cards';
import { localDate } from '../offline/ids';
import { myWeekSummaryOf, simpleDoneLine, simpleWeekLine } from './simple-helpers';
import { isSimpleSkipped, skipSimpleDay, unskipSimpleDay } from './simple-skip';
import { useSimpleStart } from './use-simple-start';
import { WorkoutTypePickerSheet } from './workout-type-chips';

// "Keep it simple" Train / Gym Today (simple training mode §6.4). Read from
// the shared `simpleToday()`: this week's ring (workouts vs the weekly goal,
// minutes and ~kcal), today's planned workout from My week (Start · Log a
// workout · Skip) or what was done, "Start a workout" for anything else, the
// routine's unscheduled days as shortcuts and the way into My week. No
// progression, offers, rotation or "No active routine" — and missing a
// planned day is never a failure.

export function SimpleTodayView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const colors = useThemeColors();
  const snackbar = useSnackbar();
  const today = localDate();
  // Bumped on Skip / Undo so the KV note is re-read at once.
  const [, setSkipTick] = useState(0);
  const skipped = isSimpleSkipped(today);
  const view = simpleToday({ bootstrap, today, skipped });
  const { startType, startDay, conflictSheet } = useSimpleStart(bootstrap);
  const [pickerOpen, setPickerOpen] = useState(false);
  // iOS presents one modal at a time: the picked type starts once the sheet is gone.
  const pickedType = useRef<WorkoutType | null>(null);
  const [log, setLog] = useState<{ open: boolean; type?: WorkoutType }>({ open: false });
  const { plan, week } = view;

  const skip = () => {
    skipSimpleDay(today);
    setSkipTick((n) => n + 1);
    snackbar.show({
      message: 'Skipped for today. Nothing is missed.',
      actionLabel: 'Undo',
      onAction: () => {
        unskipSimpleDay(today);
        setSkipTick((n) => n + 1);
      },
    });
  };

  const progress = week.goal > 0 ? Math.min(1, week.done / week.goal) : 0;
  const weekCard = (
    <TrainCard testID="simple-week-card">
      <View className="flex-row items-center gap-3">
        <ProgressRing
          progress={progress}
          size={64}
          strokeWidth={7}
          color={colors.brand}
          trackColor={colors.surfaceSunken}
          testID="simple-week-ring"
          accessibilityLabel={`${week.done} of ${week.goal} workouts this week`}
        >
          <Text className="text-callout font-bold text-label">{`${week.done}/${week.goal}`}</Text>
        </ProgressRing>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            testID="simple-week-title"
            accessibilityRole="header"
            className="text-headline font-bold text-label"
          >
            {`This week · ${week.done} of ${week.goal}`}
          </Text>
          <Text testID="simple-week-line" className="text-subhead text-label-secondary">
            {simpleWeekLine(week)}
          </Text>
          {bootstrap.bodyweightKg === null ? (
            <Text testID="simple-week-weight-hint" className="text-caption text-label-tertiary">
              Log your weight to see calories
            </Text>
          ) : null}
        </View>
      </View>
    </TrainCard>
  );

  const startButtons = (
    <View className="flex-row gap-2">
      <TrainButton
        testID="simple-start-workout"
        label="Start a workout"
        icon="play"
        className="flex-1"
        onPress={() => setPickerOpen(true)}
      />
      <TrainButton
        testID="simple-log-workout"
        label="Log a workout"
        icon="add"
        variant="tinted"
        className="flex-1"
        onPress={() => setLog({ open: true })}
      />
    </View>
  );

  let planCard;
  if (plan.kind === 'planned') {
    planCard = (
      <TrainCard testID="simple-plan-card">
        <View className="gap-0.5">
          <Text className="text-subhead font-semibold text-brand">{view.weekdayLabel}</Text>
          <Text
            testID="simple-plan-title"
            accessibilityRole="header"
            className="text-title3 font-bold text-label"
          >
            {plan.label}
          </Text>
          {plan.day.exercises.length > 0 ? (
            <Text className="text-subhead text-label-secondary">
              {`${plan.day.exercises.length} ${plan.day.exercises.length === 1 ? 'exercise' : 'exercises'}`}
            </Text>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          <TrainButton
            testID="simple-plan-start"
            label="Start"
            icon="play"
            className="flex-1"
            accessibilityLabel={`Start ${plan.label}`}
            onPress={() => startDay(plan.day)}
          />
          <TrainButton
            testID="simple-plan-log"
            label="Log a workout"
            icon="add"
            variant="tinted"
            className="flex-1"
            onPress={() =>
              setLog({ open: true, type: plan.workoutType ?? plan.day.workoutType ?? undefined })
            }
          />
        </View>
        <TrainButton
          testID="simple-plan-skip"
          label="Skip today"
          variant="ghost"
          accessibilityLabel={`Skip ${plan.label} today`}
          onPress={skip}
        />
      </TrainCard>
    );
  } else if (plan.kind === 'done') {
    planCard = (
      <TrainCard testID="simple-plan-done">
        <View className="flex-row items-start gap-3">
          <Icon name="checkmarkCircle" color={colors.positive} size={22} />
          <Text testID="simple-plan-done-line" className="min-w-0 flex-1 text-headline text-label">
            {simpleDoneLine(plan.session, bootstrap.bodyweightKg)}
          </Text>
        </View>
        <PressableScale
          testID="simple-plan-done-summary"
          accessibilityRole="link"
          accessibilityLabel={`Summary of ${plan.session.name}`}
          onPress={() =>
            router.push({ pathname: '/gym/summary/[id]', params: { id: plan.session.id } })
          }
          className="min-h-11 justify-center self-start"
        >
          <Text className="text-callout font-semibold text-brand">Summary</Text>
        </PressableScale>
      </TrainCard>
    );
  } else {
    planCard = (
      <TrainCard testID="simple-plan-open">
        <Text accessibilityRole="header" className="text-title3 font-bold text-label">
          Nothing planned today
        </Text>
        <Text className="text-subhead text-label-secondary">
          Start a workout now, or log one you already did.
        </Text>
        {startButtons}
      </TrainCard>
    );
  }

  return (
    <View testID="simple-today" className="gap-4">
      {weekCard}
      {planCard}
      {plan.kind !== 'open' ? (
        <TrainCard testID="simple-something-else">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            Something else today?
          </Text>
          {startButtons}
        </TrainCard>
      ) : null}

      {view.unscheduled.length > 0 ? (
        <ListSection title="From your routine" testID="simple-shortcuts">
          {view.unscheduled.map((day) => {
            const label = routineDayLabel(day);
            return (
              <ListRow
                key={day.id}
                testID={`simple-shortcut-${day.id}`}
                title={label}
                subtitle={
                  day.exercises.length > 0
                    ? `${day.exercises.length} ${day.exercises.length === 1 ? 'exercise' : 'exercises'}`
                    : workoutTypeLabel(day.workoutType ?? 'STRENGTH_OTHER')
                }
                icon={<Icon name="play" color={colors.brand} />}
                accessory="none"
                accessibilityHint={`Starts ${label} now`}
                onPress={() => startDay(day)}
              />
            );
          })}
        </ListSection>
      ) : null}

      <ListSection testID="simple-my-week">
        <ListRow
          testID="simple-my-week-link"
          title="My week"
          subtitle={myWeekSummaryOf(bootstrap.activeRoutine)}
          icon={<Icon name="calendar" color={colors.brand} />}
          onPress={() => router.push('/gym/my-week')}
        />
      </ListSection>

      <WorkoutTypePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onExited={() => {
          const type = pickedType.current;
          pickedType.current = null;
          if (type) startType(type);
        }}
        initial={view.defaultType ?? undefined}
        includeStrength
        confirmLabel="Start"
        testID="simple-type-picker"
        onPick={(type) => {
          pickedType.current = type;
          setPickerOpen(false);
        }}
      />
      <LogWorkoutSheet
        visible={log.open}
        onClose={() => setLog({ open: false })}
        initialType={log.type}
      />
      {conflictSheet}
    </View>
  );
}
