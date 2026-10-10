import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  MediaFrame,
  PressableScale,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { resumeSummary, selectTodaysSession, todayStatus, weekdayOf } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useActiveSessionPausedAt } from '../../gym/offline/active-session-store';
import { localDate } from '../../gym/offline/ids';
import { weekdayLabel } from '../../gym/routine/weekday';
import { setupLocalDate, workoutForDay } from '../../gym/today/today-helpers';
import { useActiveWorkout } from '../../gym/use-active-workout';
import { libraryLookup, useGymBootstrap } from '../../gym/use-gym-bootstrap';
import { supersetsOf } from '../../gym/workout/workout-model';
import { LogWorkoutSheet } from '../log-workout-sheet';
import { ActionButton, BoardCard, SectionTitle } from './parts';
import { clockTime, doneToday, type DoneToday } from './today-helpers';
import { useStartGuard } from './use-start-guard';

// Today's "Training" (10 Oct redesign, boards Home / HomeDone). The same
// states as the old Food Today workout card (TodaysWorkoutCard), all read
// from the persisted gym bootstrap and the shared `todayStatus()` /
// `selectTodaysSession()` selectors, so Today and Train never disagree:
//  - a workout in progress or paused → Resume;
//  - a session finished today → "Done at 18:40", Summary and three stat tiles
//    (kcal only when the user entered it on an activity — Chefer has no burn
//    estimate for gym workouts, so the tile shows Sets instead);
//  - a planned day → Start workout (guarded like Train's Start) and Log a workout;
//  - a rest day → one compact line; no gym profile or nothing planned → nothing,
//    so people who don't train are never nagged.

export function TrainingSection() {
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const activeWorkout = useActiveWorkout();
  const pausedAt = useActiveSessionPausedAt();
  const { startPlanned, conflictSheet } = useStartGuard();
  const [logOpen, setLogOpen] = useState(false);

  if (!bootstrap?.profile) return null;
  const today = localDate();
  const logSheet = <LogWorkoutSheet visible={logOpen} onClose={() => setLogOpen(false)} />;
  const section = (card: React.ReactNode) => (
    <View testID="today-training" className="gap-3">
      <SectionTitle>Training</SectionTitle>
      {card}
      {logSheet}
      {conflictSheet}
    </View>
  );

  // An in-progress or paused session outranks everything (T-36.A1.2) — the
  // same resumeSummary() the Train Resume card builds on.
  if (activeWorkout.isActive && activeWorkout.session) {
    const session = activeWorkout.session;
    const summary = resumeSummary(session, {
      now: new Date().toISOString(),
      pausedAt,
      isBackfill: session.localDate !== today,
      supersets: supersetsOf(session, bootstrap),
      lookup: libraryLookup(bootstrap),
    });
    const stateLabel = summary.state === 'paused' ? 'Workout paused' : 'Workout in progress';
    return section(
      <BoardCard testID="today-training-resume">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-subhead font-semibold text-brand">{stateLabel}</Text>
            <Text numberOfLines={1} className="text-headline font-bold text-label">
              {summary.name}
            </Text>
            <Text className="text-subhead text-label-secondary">
              {`${summary.exercisesDone} of ${summary.exercisesTotal} exercises`}
            </Text>
          </View>
          <ActionButton
            testID="today-training-resume-button"
            label="Resume"
            icon="play"
            variant="filled"
            onPress={() => {
              activeWorkout.resume();
              router.push('/gym/workout');
            }}
          />
        </View>
      </BoardCard>,
    );
  }

  const doneCard = (done: DoneToday) =>
    section(
      <BoardCard testID="today-training-done">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row items-center gap-1">
              <Icon name="checkmark" color={colors.positive} size={16} />
              <Text
                testID="today-training-done-at"
                className="text-subhead font-semibold text-positive"
              >
                {`Done at ${clockTime(done.finishedAt)}`}
              </Text>
            </View>
            <Text numberOfLines={2} className="text-headline font-bold text-label">
              {done.session.name}
            </Text>
          </View>
          <PressableScale
            testID="today-training-summary"
            accessibilityRole="link"
            accessibilityLabel={`Summary of ${done.session.name}`}
            onPress={() =>
              router.push({ pathname: '/gym/summary/[id]', params: { id: done.session.id } })
            }
            className="min-h-11 justify-center pl-2"
          >
            <Text className="text-callout font-semibold text-brand">Summary</Text>
          </PressableScale>
        </View>
        <StatTiles testID="today-training-stats">
          <StatTile
            testID="today-training-duration"
            icon={<Icon name="time" color={colors.brand} size={18} />}
            value={String(done.durationMin)}
            unit="min"
            label="Duration"
          />
          {done.caloriesKcal !== null ? (
            <StatTile
              testID="today-training-kcal"
              icon={<Icon name="flame" color={colors.brand} size={18} />}
              value={`~${done.caloriesKcal}`}
              label="kcal, from your watch"
            />
          ) : (
            <StatTile
              testID="today-training-sets"
              icon={<Icon name="barbell" color={colors.brand} size={18} />}
              value={String(done.workingSets)}
              label="Sets"
            />
          )}
          <StatTile
            testID="today-training-exercises"
            icon={<Icon name="list" color={colors.brand} size={18} />}
            value={String(done.exercises)}
            label="Exercises"
          />
        </StatTiles>
        <ActionButton
          testID="today-training-log-another"
          label="Log another workout"
          icon="add"
          onPress={() => setLogOpen(true)}
        />
      </BoardCard>,
    );

  const doneGym = doneToday(bootstrap, today);
  if (doneGym) return doneCard(doneGym);

  const since = setupLocalDate(bootstrap.profile.setupCompletedAt);
  const status = todayStatus({ bootstrap, today, since });
  // UX-FOOD-19: a routine day pinned to today's weekday beats the rotation's next.
  const todays = selectTodaysSession({ bootstrap, today, since });
  const nextWorkout =
    todays.kind === 'planned'
      ? workoutForDay(bootstrap, todays.dayId, today)
      : bootstrap.nextWorkout;

  // An activity logged today (a class done elsewhere) doesn't replace a
  // workout still to do; otherwise it is today's training, done.
  const doneActivity = doneToday(bootstrap, today, { includeActivities: true });
  const plannedToday = status.kind === 'training' || todays.kind === 'planned';
  if (doneActivity && !(plannedToday && nextWorkout)) return doneCard(doneActivity);

  if (status.kind === 'done' || (status.kind === 'rest' && todays.kind !== 'planned')) {
    const lead = status.kind === 'done' ? 'Done today' : 'Rest day';
    return section(
      <BoardCard testID="today-training-rest" className="flex-row items-center gap-3">
        <Text testID="today-training-rest-label" className="min-w-0 flex-1 text-callout text-label">
          {`${lead} · Next: ${status.dayName} on ${weekdayLabel(status.weekday)}`}
        </Text>
        <PressableScale
          testID="today-training-open-train"
          accessibilityRole="link"
          accessibilityLabel="Open Train"
          onPress={() => router.navigate('/train')}
          className="min-h-11 justify-center"
        >
          <Text className="text-callout font-semibold text-brand">
            {status.kind === 'done' ? 'Train' : 'Train anyway'}
          </Text>
        </PressableScale>
      </BoardCard>,
    );
  }

  // Training with no routine day to offer — nothing useful to show here.
  if (!nextWorkout) return null;

  // A rotation day pinned to another weekday is "up next", not today's training.
  const pinnedWeekday =
    todays.kind === 'rotation'
      ? (bootstrap.activeRoutine?.days.find((d) => d.id === todays.dayId)?.plannedWeekday ?? null)
      : null;
  const offSchedule = pinnedWeekday !== null && pinnedWeekday !== weekdayOf(today);

  return section(
    <BoardCard testID="today-training-planned">
      <View className="flex-row items-center gap-3">
        <MediaFrame
          size={56}
          square
          radius="inner"
          illustration={<Icon name="barbell" color={colors.brand} size={26} />}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-subhead font-semibold text-brand">
            {offSchedule ? `Up next · usually ${weekdayLabel(pinnedWeekday)}` : 'Planned today'}
          </Text>
          <Text
            testID="today-training-day"
            numberOfLines={1}
            className="text-headline font-bold text-label"
          >
            {nextWorkout.dayName}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {`${nextWorkout.exercises.length} exercises · ~${nextWorkout.estimatedMin} min`}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <ActionButton
          testID="today-training-start"
          label="Start workout"
          icon="play"
          variant="filled"
          className="flex-1 px-2"
          onPress={() => startPlanned(nextWorkout)}
        />
        <ActionButton
          testID="today-training-log"
          label="Log a workout"
          icon="add"
          className="flex-1 px-2"
          onPress={() => setLogOpen(true)}
        />
      </View>
    </BoardCard>,
  );
}
