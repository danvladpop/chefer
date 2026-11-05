import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import type { WorkoutType } from '@chefer/types';
import {
  MediaFrame,
  PressableScale,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  isSimpleTraining,
  resumeSummary,
  selectTodaysSession,
  simpleToday,
  todayStatus,
  weekdayOf,
  type SessionKcal,
  type SessionKcalCopy,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { useT } from '../../../lib/i18n';
import { CoachingNotices } from '../../coaching/notices/coaching-notices';
import { exerciseCoverUrl, libraryImages } from '../../gym/library/exercise-image';
import { useActiveSessionPausedAt } from '../../gym/offline/active-session-store';
import { localDate } from '../../gym/offline/ids';
import { isSimpleSkipped } from '../../gym/simple/simple-skip';
import { useSimpleStart } from '../../gym/simple/use-simple-start';
import { setupLocalDate, workoutForDay } from '../../gym/today/today-helpers';
import { useActiveWorkout } from '../../gym/use-active-workout';
import { libraryLookup, useGymBootstrap } from '../../gym/use-gym-bootstrap';
import { supersetsOf } from '../../gym/workout/workout-model';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { LogWorkoutSheet } from '../log-workout-sheet';
import { BurnTile } from '../train/burn-tile';
import { ActionButton, BoardCard, SectionTitle } from './parts';
import { clockTime, doneToday, type DoneToday } from './today-helpers';
import { useStartGuard } from './use-start-guard';

// Today's "Training" (10 Oct redesign, boards Home / HomeDone). The same
// states as the old Food Today workout card (TodaysWorkoutCard), all read
// from the persisted gym bootstrap and the shared `todayStatus()` /
// `selectTodaysSession()` selectors, so Today and Train never disagree:
//  - a workout in progress or paused → Resume;
//  - a session finished today → "Done at 18:40", Summary and three stat tiles
//    (kcal: what the user logged, else "~310 kcal burned (est.)" from their
//    bodyweight and the workout time — `estimateSessionKcal`; Sets only when
//    neither exists, e.g. no weigh-in yet);
//  - a planned day → Start workout (guarded like Train's Start) and Log a workout;
//  - a rest day → one compact line; no gym profile or nothing planned → nothing,
//    so people who don't train are never nagged.
// WP-18: the coaching notices ("Ana updated your routine", "Ana stopped coaching
// you", "Carry on joining your trainer") sit under the section title, as on
// Train; with no card to show they stand alone. Self-gated on coaching.availability.

// Weekday convention: 0 = Monday … 6 = Sunday (gym/routine/weekday.ts).
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** weekdayLabel() in the UI language: "Monday", or "No fixed day". */
function weekdayName(t: Translator['t'], weekday: number | null): string {
  const key = weekday === null ? undefined : WEEKDAY_KEYS[weekday];
  return key ? t(`common.weekdays.${key}`) : t('today.shell.training.noFixedDay');
}

/** sessionKcalCopy() in the UI language: the burn tile's value, caption and spoken label. */
function burnCopy(t: Translator['t'], burn: SessionKcal): SessionKcalCopy {
  const value = burn.kcal;
  if (burn.isEstimate) {
    return {
      value: t('today.shell.training.burn.estimate.value', { value }),
      label: t('today.shell.training.burn.estimate.label.kcal'),
      spoken: t('today.shell.training.burn.estimate.spoken.kcal', { value }),
      hint: t('today.shell.training.burn.estimate.hint'),
    };
  }
  return {
    value: String(value),
    label: t('today.shell.training.burn.logged.label.kcal'),
    spoken: t('today.shell.training.burn.logged.spoken.kcal', { value }),
    hint: t('today.shell.training.burn.logged.hint'),
  };
}

export function TrainingSection() {
  const { t } = useT();
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const activeWorkout = useActiveWorkout();
  const pausedAt = useActiveSessionPausedAt();
  const { startPlanned, conflictSheet } = useStartGuard();
  const flags = useFlags();
  const simpleStart = useSimpleStart(bootstrap);
  // WP-08 / lane E3: calories burned are a calorie figure too.
  const { proteinOnly } = useNumbersMode();
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<WorkoutType | undefined>(undefined);

  if (!bootstrap) return null;
  const notices = <CoachingNotices />;
  if (!bootstrap.profile) return notices;
  const today = localDate();
  const simple = isSimpleTraining(bootstrap.profile, flags);
  const logSheet = (
    <LogWorkoutSheet visible={logOpen} onClose={() => setLogOpen(false)} initialType={logType} />
  );
  const openLog = (type?: WorkoutType) => {
    setLogType(type);
    setLogOpen(true);
  };
  const section = (card: React.ReactNode) => (
    <View testID="today-training" className="gap-3">
      <SectionTitle>{t('today.shell.training.title')}</SectionTitle>
      {notices}
      {card}
      {logSheet}
      {simple ? simpleStart.conflictSheet : conflictSheet}
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
    const stateLabel =
      summary.state === 'paused'
        ? t('today.shell.training.paused')
        : t('today.shell.training.inProgress');
    return section(
      <BoardCard testID="today-training-resume">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-subhead font-semibold text-brand">{stateLabel}</Text>
            <Text numberOfLines={1} className="text-headline font-bold text-label">
              {summary.name}
            </Text>
            <Text className="text-subhead text-label-secondary">
              {t('today.shell.training.exercisesDone', {
                done: summary.exercisesDone,
                count: summary.exercisesTotal,
              })}
            </Text>
          </View>
          <ActionButton
            testID="today-training-resume-button"
            label={t('today.shell.training.resume')}
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
                {t('today.shell.training.doneAt', { time: clockTime(done.finishedAt) })}
              </Text>
            </View>
            <Text numberOfLines={2} className="text-headline font-bold text-label">
              {done.session.name}
            </Text>
          </View>
          <PressableScale
            testID="today-training-summary"
            accessibilityRole="link"
            accessibilityLabel={t('today.shell.training.summaryOf', { name: done.session.name })}
            onPress={() =>
              router.push({ pathname: '/gym/summary/[id]', params: { id: done.session.id } })
            }
            className="min-h-11 justify-center pl-2"
          >
            <Text className="text-callout font-semibold text-brand">
              {t('today.shell.training.summary')}
            </Text>
          </PressableScale>
        </View>
        <StatTiles testID="today-training-stats">
          <StatTile
            testID="today-training-duration"
            icon={<Icon name="time" color={colors.brand} size={18} />}
            value={String(done.durationMin)}
            unit={t('today.shell.training.minutesUnit')}
            label={t('today.shell.training.duration')}
          />
          {done.burn && !proteinOnly ? (
            <BurnTile testID="today-training-kcal" copy={burnCopy(t, done.burn)} />
          ) : (
            <StatTile
              testID="today-training-sets"
              icon={<Icon name="barbell" color={colors.brand} size={18} />}
              value={String(done.workingSets)}
              label={t('today.shell.training.sets')}
            />
          )}
          <StatTile
            testID="today-training-exercises"
            icon={<Icon name="list" color={colors.brand} size={18} />}
            value={String(done.exercises)}
            label={t('today.shell.training.exercises')}
          />
        </StatTiles>
        <ActionButton
          testID="today-training-log-another"
          label={t('today.shell.training.logAnother')}
          icon="add"
          onPress={() => openLog()}
        />
      </BoardCard>,
    );

  const doneGym = doneToday(bootstrap, today);
  if (doneGym) return doneCard(doneGym);

  // "Keep it simple" (simple training mode §6.4): today's My week workout, if
  // any — Start runs the typed live workout; nothing planned shows nothing.
  if (simple) {
    const { plan } = simpleToday({ bootstrap, today, skipped: isSimpleSkipped(today) });
    if (plan.kind !== 'planned') return null;
    return section(
      <BoardCard testID="today-training-simple">
        <View className="min-w-0 gap-0.5">
          <Text className="text-subhead font-semibold text-brand">
            {t('today.shell.training.plannedToday')}
          </Text>
          <Text
            testID="today-training-day"
            numberOfLines={1}
            className="text-headline font-bold text-label"
          >
            {plan.label}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <ActionButton
            testID="today-training-start"
            label={t('today.shell.training.start')}
            icon="play"
            variant="filled"
            className="flex-1 px-2"
            onPress={() => simpleStart.startDay(plan.day)}
          />
          <ActionButton
            testID="today-training-log"
            label={t('today.shell.training.logWorkout')}
            icon="add"
            className="flex-1 px-2"
            onPress={() => openLog(plan.workoutType ?? undefined)}
          />
        </View>
      </BoardCard>,
    );
  }

  const since = setupLocalDate(bootstrap.profile.setupCompletedAt);
  const status = todayStatus({ bootstrap, today, since });
  // UX-FOOD-19: a routine day pinned to today's weekday beats the rotation's next.
  const todays = selectTodaysSession({ bootstrap, today, since });
  const nextWorkout =
    todays.kind === 'planned'
      ? workoutForDay(bootstrap, todays.dayId, today)
      : bootstrap.nextWorkout;

  if (status.kind === 'done' || (status.kind === 'rest' && todays.kind !== 'planned')) {
    return section(
      <BoardCard testID="today-training-rest" className="flex-row items-center gap-3">
        <Text testID="today-training-rest-label" className="min-w-0 flex-1 text-callout text-label">
          {t(
            status.kind === 'done'
              ? 'today.shell.training.doneNext'
              : 'today.shell.training.restNext',
            { day: status.dayName, weekday: weekdayName(t, status.weekday) },
          )}
        </Text>
        <PressableScale
          testID="today-training-open-train"
          accessibilityRole="link"
          accessibilityLabel={t('today.shell.training.openTrain')}
          onPress={() => router.navigate('/train')}
          className="min-h-11 justify-center"
        >
          <Text className="text-callout font-semibold text-brand">
            {status.kind === 'done'
              ? t('today.shell.training.train')
              : t('today.shell.training.trainAnyway')}
          </Text>
        </PressableScale>
      </BoardCard>,
    );
  }

  // Training with no routine day to offer — nothing useful to show here.
  if (!nextWorkout) return notices;

  // A rotation day pinned to another weekday is "up next", not today's training.
  const pinnedWeekday =
    todays.kind === 'rotation'
      ? (bootstrap.activeRoutine?.days.find((d) => d.id === todays.dayId)?.plannedWeekday ?? null)
      : null;
  const offSchedule = pinnedWeekday !== null && pinnedWeekday !== weekdayOf(today);

  return section(
    <BoardCard testID="today-training-planned">
      <View className="flex-row items-center gap-3">
        {/* The first exercise photo of the day; the barbell when none has one. */}
        <MediaFrame
          testID="today-training-cover"
          size={56}
          square
          radius="inner"
          imageUri={exerciseCoverUrl(
            nextWorkout.exercises.map((e) => e.exerciseId),
            libraryImages(bootstrap.library),
          )}
          illustration={<Icon name="barbell" color={colors.brand} size={26} />}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-subhead font-semibold text-brand">
            {offSchedule
              ? t('today.shell.training.upNext', { weekday: weekdayName(t, pinnedWeekday) })
              : t('today.shell.training.plannedToday')}
          </Text>
          <Text
            testID="today-training-day"
            numberOfLines={1}
            className="text-headline font-bold text-label"
          >
            {nextWorkout.dayName}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {t('today.shell.training.workoutMeta', {
              count: nextWorkout.exercises.length,
              min: nextWorkout.estimatedMin,
            })}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <ActionButton
          testID="today-training-start"
          label={t('today.shell.training.startWorkout')}
          icon="play"
          variant="filled"
          className="flex-1 px-2"
          onPress={() => startPlanned(nextWorkout)}
        />
        <ActionButton
          testID="today-training-log"
          label={t('today.shell.training.logWorkout')}
          icon="add"
          className="flex-1 px-2"
          onPress={() => openLog()}
        />
      </View>
    </BoardCard>,
  );
}
