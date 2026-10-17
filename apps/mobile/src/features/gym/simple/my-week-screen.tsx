import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, RoutineDto, WorkoutType } from '@chefer/types';
import {
  IconButton,
  ListRow,
  ListSection,
  Screen,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  myWeekOf,
  myWeekPlanOf,
  plannedDayCount,
  routineDayLabel,
  userFacingErrorMessage,
  WEEKDAY_LONG,
  workoutTypeLabel,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { ShellChromeProvider, ShellTopBar } from '../../shell/shell-chrome';
import { useShellV2 } from '../../shell/shell-store';
import { TrainButton } from '../../shell/train/train-button';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { extractRoutineConflict } from '../routine/conflict';
import { gymBootstrapQueryKey, useGymBootstrap } from '../use-gym-bootstrap';
import { clampWeeklyGoal, myWeekGoalShown } from './simple-helpers';
import { WorkoutTypePickerSheet } from './workout-type-chips';

// My week (simple training mode §6.4, ADR 0001): the "Keep it simple" view of
// the ONE active routine — seven rows, Monday first, each Rest or a workout
// type. Tapping a row opens the type picker (with Rest). The weekly goal
// follows the planned days until the user sets it. Saved with
// `gym.routine.saveMyWeek` (versioned like any routine save). Missing a
// planned day is never shown as a failure — nothing here is red.

type Plan = (WorkoutType | null)[];

const CONFLICT_COPY =
  'Your week changed on another device. We loaded the latest — check it and save again.';

function isConflict(error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return code === 'CONFLICT' || extractRoutineConflict(error) !== null;
}

function planOf(routine: RoutineDto | null): Plan {
  return myWeekPlanOf(myWeekOf(routine));
}

export function MyWeekScreen() {
  const shellV2 = useShellV2();
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: shellV2 ? '/train' : '/today', title: 'My week' }}
    >
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <MyWeekBody />
      </Screen>
    </ShellChromeProvider>
  );
}

function MyWeekBody() {
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  if (!bootstrap || bootstrapLoad.load !== 'data') {
    return (
      <>
        <View className="px-4 pt-2">
          <ShellTopBar />
        </View>
        <GymBootstrapUnavailable
          load={bootstrapLoad.load === 'data' ? 'loading' : bootstrapLoad.load}
          onRetry={bootstrapLoad.retry}
          testID="my-week"
          what="your week"
        />
      </>
    );
  }
  return <MyWeekEditor bootstrap={bootstrap} />;
}

function MyWeekEditor({ bootstrap }: { bootstrap: GymBootstrap }) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const routine = bootstrap.activeRoutine;
  const [plan, setPlan] = useState<Plan>(() => planOf(routine));
  const [version, setVersion] = useState<number | undefined>(routine?.version);
  // null = not touched: the goal follows the planned days (§6.4).
  const [goalTouched, setGoalTouched] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unscheduled = myWeekOf(routine).unscheduled;
  const goal = myWeekGoalShown(plannedDayCount(plan), goalTouched);

  const save = trpc.gym.routine.saveMyWeek.useMutation({
    meta: { silent: true },
    onSuccess: (result) => {
      queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (prev) =>
        prev
          ? {
              ...prev,
              activeRoutine: result.routine,
              ...(prev.profile &&
                result.weeklyGoal !== null && {
                  profile: { ...prev.profile, weeklyGoal: result.weeklyGoal },
                }),
            }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
      snackbar.show({ message: 'My week saved', tone: 'success' });
      if (router.canGoBack()) router.back();
      else router.replace('/train');
    },
    onError: async (err) => {
      if (!isConflict(err)) {
        setError(userFacingErrorMessage(err));
        return;
      }
      // Stale version: reload the latest and say so plainly.
      const current = extractRoutineConflict(err);
      if (current) {
        setPlan(planOf(current));
        setVersion(current.version);
      }
      await queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
      const fresh = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
      if (!current && fresh) {
        setPlan(planOf(fresh.activeRoutine));
        setVersion(fresh.activeRoutine?.version);
      }
      setError(CONFLICT_COPY);
    },
  });

  const onSave = () => {
    if (save.isPending) return;
    setError(null);
    save.mutate({
      week: plan,
      ...(version !== undefined && { expectedVersion: version }),
      ...(goalTouched !== null && { weeklyGoal: goalTouched }),
    });
  };

  const setDay = (weekday: number, type: WorkoutType | null) =>
    setPlan((prev) => prev.map((t, i) => (i === weekday ? type : t)));

  return (
    <>
      <ScrollView testID="my-week-scroll" contentContainerClassName="gap-5 px-4 pb-8 pt-2">
        <ShellTopBar />
        <Text className="text-subhead text-label-secondary">
          Pick what you’d like to do each day. You can change it any time.
        </Text>

        <ListSection testID="my-week-rows">
          {plan.map((type, weekday) => (
            <ListRow
              key={weekday}
              testID={`my-week-row-${weekday}`}
              title={WEEKDAY_LONG[weekday] ?? ''}
              value={type ? workoutTypeLabel(type) : 'Rest'}
              accessibilityHint="Choose a workout type or Rest"
              onPress={() => setEditing(weekday)}
            />
          ))}
        </ListSection>

        <View
          testID="my-week-goal"
          className="min-h-11 flex-row items-center gap-3 rounded-card border border-separator bg-surface px-4 py-2.5"
        >
          <Text
            testID="my-week-goal-label"
            className="min-w-0 flex-1 text-body text-label"
          >{`Weekly goal: ${goal} ${goal === 1 ? 'workout' : 'workouts'}`}</Text>
          <IconButton
            testID="my-week-goal-dec"
            accessibilityLabel="Fewer workouts a week"
            icon={<Icon name="remove" color={colors.labelSecondary} />}
            disabled={goal <= 1}
            onPress={() => setGoalTouched(clampWeeklyGoal(goal - 1))}
            className="bg-surface-sunken"
          />
          <IconButton
            testID="my-week-goal-inc"
            accessibilityLabel="More workouts a week"
            icon={<Icon name="add" color={colors.labelSecondary} />}
            disabled={goal >= 7}
            onPress={() => setGoalTouched(clampWeeklyGoal(goal + 1))}
            className="bg-surface-sunken"
          />
        </View>

        {unscheduled.length > 0 ? (
          <ListSection
            title="Not on a weekday"
            footer="Start these from Today."
            testID="my-week-unscheduled"
          >
            {unscheduled.map((day) => (
              <ListRow
                key={day.id}
                testID={`my-week-unscheduled-${day.id}`}
                title={routineDayLabel(day)}
                accessory="none"
              />
            ))}
          </ListSection>
        ) : null}

        {error ? (
          <Text
            testID="my-week-error"
            accessibilityLiveRegion="polite"
            className="text-subhead text-label"
          >
            {error}
          </Text>
        ) : null}

        <TrainButton
          testID="my-week-save"
          label="Save"
          size="lg"
          loading={save.isPending}
          onPress={onSave}
        />
      </ScrollView>

      <WorkoutTypePickerSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing !== null ? (WEEKDAY_LONG[editing] ?? 'Day') : 'Day'}
        initial={editing !== null ? plan[editing] : undefined}
        includeStrength
        includeRest
        testID="my-week-picker"
        onPick={(type) => {
          if (editing !== null) setDay(editing, type);
          setEditing(null);
        }}
      />
    </>
  );
}
