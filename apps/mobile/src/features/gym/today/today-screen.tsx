import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text as RNText, ScrollView, View } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import type { GymBootstrap, GymOffer, NextWorkoutDto } from '@chefer/types';
import {
  Button,
  Card,
  EmptyState,
  ProgressRing,
  Screen,
  Sheet,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  cn,
  doneTodayCard,
  missedPlannedDays,
  monthNameOf,
  proRatedWeekGoal,
  selectTodaysSession,
  shortVersionOfWorkout,
  supersetRuns,
  supersetSlot,
  todayStatus,
  weekStartOf,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { captureGymEvent } from '../analytics';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { ModeSwitch } from '../components/mode-switch';
import { OutboxWaitingCard } from '../components/outbox-waiting-card';
import { useActiveSessionPausedAt } from '../offline/active-session-store';
import { localDate } from '../offline/ids';
import { useOutboxStatus } from '../offline/outbox';
import { useGymReminders } from '../reminders/use-gym-reminders';
import { weekdayLabel } from '../routine/weekday';
import { checkPausedWorkoutTimeout, useActiveWorkout } from '../use-active-workout';
import { gymBootstrapQueryKey, libraryLookup, useGymBootstrap } from '../use-gym-bootstrap';
import { HowThisWorksSheet } from './how-this-works-sheet';
import { LogPastWorkoutAction } from './log-past-workout';
import { dismissMissedDay, isMissedDayDismissed } from './missed-day-dismissed';
import { RecentWorkouts } from './recent-workouts';
import { ResumeCard } from './resume-card';
import { StartConflictSheet } from './start-conflict-sheet';
import { TargetChangeNotice } from './target-change-notice';
import { getTimeToday, setTimeToday } from './time-today';
import { TimeTodayChips } from './time-today-chips';
import {
  computeWeekStrip,
  formatStreakLine,
  formatTarget,
  pickOffer,
  setupLocalDate,
  workoutForDay,
  type WeekStripDay,
} from './today-helpers';
import { useTimedRefresh } from './use-timed-refresh';

// Gym Today tab (gym_plan.md §1.3 "Today tab"). The persisted bootstrap drives
// everything here. Picking a day ("Do another day instead", "Train again
// today?", a missed day's "Do it today") starts it straight away, built
// locally by the shared engine so it works the same online and offline (D6);
// only "Skip" and "Make it next" move the server's rotation pointer.
// Owner dogfood 2026-09-29: every state offers another day or freestyle —
// real weeks rarely follow the plan to the letter.

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekStrip({ days }: { days: WeekStripDay[] }) {
  return (
    <View testID="gym-today-week-strip" className="flex-row justify-between">
      {days.map((day, i) => (
        <View
          key={day.localDate}
          testID={`gym-today-week-strip-${day.weekday}`}
          className="items-center gap-1"
        >
          <Text variant="muted" className="text-xs">
            {WEEKDAY_LABELS[i]}
          </Text>
          <View
            className={cn(
              'h-3 w-3 rounded-full',
              day.status === 'done' && 'bg-primary',
              day.status === 'planned' && 'border-2 border-primary bg-transparent',
              day.status === 'neutral' && 'bg-muted',
            )}
          />
        </View>
      ))}
    </View>
  );
}

export function TodayScreen() {
  const queryClient = useQueryClient();
  useGymReminders();
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const activeWorkout = useActiveWorkout();
  const pausedAt = useActiveSessionPausedAt();
  const outboxStatus = useOutboxStatus();
  const snackbar = useSnackbar();
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
  const [howThisWorksVisible, setHowThisWorksVisible] = useState(false);
  // T-36.6: `Time today:` — remembered per weekday on-device, null = Full.
  const [timeToday, setTimeTodayState] = useState<number | null>(() => getTimeToday(localDate()));
  // Bumped on "Not this week" so the dismissed KV write is reflected without
  // waiting for an unrelated re-render (dismissal is local-only, D22).
  const [missedDismissTick, setMissedDismissTick] = useState(0);
  // Bug B-26: the pull-to-refresh spinner always drops after 10 s, even if
  // the refetch itself never settles (host load, a flaky connection).
  const { refreshing: manualRefreshing, onRefresh: handleRefresh } = useTimedRefresh(() =>
    bootstrapQuery.refetch(),
  );

  // UX-36 (3), T-36.3: a "Save for later" session past its 24 h window
  // finishes automatically with whatever was logged — checked every time
  // Gym Today comes into focus (cold start, tab switch, backgrounded app).
  useFocusEffect(
    useCallback(() => {
      void checkPausedWorkoutTimeout(queryClient).then((notice) => {
        if (!notice) return;
        snackbar.show({
          message: `We finished your ${notice.dayName} with ${notice.workingSetsDone} ${notice.workingSetsDone === 1 ? 'set' : 'sets'}.`,
        });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient/snackbar are stable
    }, []),
  );

  const setNextDayMutation = trpc.gym.routine.setNextDay.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });
  const dismissOfferMutation = trpc.gym.progression.dismissOffer.useMutation();
  const startDeloadMutation = trpc.gym.progression.startDeload.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });
  const pauseEndMutation = trpc.gym.pause.end.useMutation({
    // UX-GYM-06: drop the pause card at once; the refetch below confirms it
    // (or restores it on an error).
    onMutate: () =>
      queryClient.setQueryData(gymBootstrapQueryKey, (prev: GymBootstrap | undefined) =>
        prev ? { ...prev, activePause: null } : prev,
      ),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });

  // UX-GYM-02: `startWorkout` hands back the EXISTING session when one is in
  // progress, so a start tap used to land in the old workout with no word. Any
  // start while one is open parks here and the sheet asks: Resume / Finish & start
  // / Discard & start.
  const [pendingStart, setPendingStart] = useState<{
    targetName: string;
    run: () => void;
  } | null>(null);
  const guardStart = (targetName: string, run: () => void) => {
    if (activeWorkout.isActive) setPendingStart({ targetName, run });
    else run();
  };
  const handleConflictResume = () => {
    setPendingStart(null);
    activeWorkout.resume();
    router.push('/gym/workout');
  };
  const handleConflictFinishAndStart = async () => {
    const run = pendingStart?.run;
    setPendingStart(null);
    if (!run) return;
    const finished = await activeWorkout.finish();
    if (finished) snackbar.show({ message: `${finished.name} finished.` });
    run();
  };
  const handleConflictDiscardAndStart = () => {
    const run = pendingStart?.run;
    setPendingStart(null);
    if (!run) return;
    activeWorkout.discard();
    run();
  };

  const startPlanned = (workout: NextWorkoutDto, carryOverExerciseIds?: string[]) => {
    guardStart(workout.dayName, () => {
      activeWorkout.start({
        kind: 'planned',
        workout,
        ...(carryOverExerciseIds?.length ? { carryOverExerciseIds } : {}),
      });
      router.push('/gym/workout');
    });
  };

  const handleTimeTodayChange = (minutes: number | null) => {
    setTimeTodayState(minutes);
    setTimeToday(localDate(), minutes);
    captureGymEvent('session_time_chosen', { minutes, where: 'start' });
  };

  const startFreestyle = () => {
    guardStart('a freestyle workout', () => {
      activeWorkout.start({ kind: 'freestyle' });
      router.push('/gym/workout');
    });
  };

  // Starts `dayId` now. Used to only move the server's rotation pointer when
  // online, which on a rest day just re-rendered "Rest day" for the picked
  // day — the user could never actually start it. Finishing the session
  // advances the rotation from this day either way.
  const startDay = (dayId: string) => {
    if (!bootstrap) return;
    const workout = workoutForDay(bootstrap, dayId, localDate());
    if (workout) startPlanned(workout);
  };

  const handlePickDay = (dayId: string) => {
    setDayPickerVisible(false);
    startDay(dayId);
  };

  const handlePickFreestyle = () => {
    setDayPickerVisible(false);
    startFreestyle();
  };

  // Bug B-45: "Skip this day" used to swap the workout with no feedback or
  // way back. A snackbar names both days and offers Undo (setNextDay back to
  // the skipped day) — disabled offline, same as Skip itself.
  const handleSkip = () => {
    if (!bootstrap?.activeRoutine) return;
    const routineId = bootstrap.activeRoutine.id;
    const days = [...bootstrap.activeRoutine.days].sort((a, b) => a.position - b.position);
    const skippedId = bootstrap.nextWorkout?.dayId ?? null;
    const idx = skippedId ? days.findIndex((d) => d.id === skippedId) : -1;
    const after = days[(idx + 1) % days.length] ?? days[0];
    const skipped = days.find((d) => d.id === skippedId);
    if (!after) return;
    setNextDayMutation.mutate(
      { routineId, dayId: after.id },
      {
        onSuccess: () => {
          snackbar.show({
            message: `Skipped ${skipped?.name ?? 'this day'} · Next: ${after.name}`,
            actionLabel: 'Undo',
            onAction: () => {
              if (!skippedId || !onlineManager.isOnline()) return;
              setNextDayMutation.mutate({ routineId, dayId: skippedId });
            },
          });
        },
      },
    );
  };

  const handleDismissOffer = (offer: GymOffer) => {
    dismissOfferMutation.mutate(
      { kind: offer.kind, key: offer.key },
      {
        onSuccess: () =>
          queryClient.setQueryData(gymBootstrapQueryKey, (prev: GymBootstrap | undefined) =>
            prev ? { ...prev, offers: prev.offers.filter((o) => o.key !== offer.key) } : prev,
          ),
      },
    );
  };

  const header = (
    <View className="gap-1">
      <ModeSwitch mode="gym" />
      <Text testID="gym-today-title" variant="title" className="mt-1">
        Today
      </Text>
    </View>
  );

  // UX-GYM-24: a failed first load shows Retry (not an endless spinner); with
  // no connection and no cache, "needs a connection".
  if (!bootstrap || bootstrapLoad.load !== 'data') {
    return (
      <Screen className="px-0">
        <View className="gap-4 px-4 pt-3">{header}</View>
        <GymBootstrapUnavailable
          load={bootstrapLoad.load === 'data' ? 'loading' : bootstrapLoad.load}
          onRetry={bootstrapLoad.retry}
          testID="gym-today"
          what="your training"
        />
      </Screen>
    );
  }

  if (!bootstrap.profile) {
    return (
      <Screen className="px-0">
        <View className="gap-4 px-4 pt-3">{header}</View>
        <EmptyState
          testID="gym-today-empty-setup"
          title="Set up your training"
          description="A 90-second setup gets you a routine and today's workout."
          action={{
            label: 'Set up training',
            onPress: () => router.push('/gym/setup'),
            testID: 'gym-today-setup-cta',
          }}
        />
      </Screen>
    );
  }

  if (!bootstrap.activeRoutine) {
    return (
      <Screen className="px-0">
        <View className="gap-4 px-4 pt-3">{header}</View>
        <EmptyState
          testID="gym-today-empty-routine"
          title="No active routine"
          description="Pick or build a routine to see today's workout."
          action={{
            label: 'Go to Routine',
            onPress: () => router.push('/routine'),
            testID: 'gym-today-routine-cta',
          }}
        />
      </Screen>
    );
  }

  const today = localDate();
  const weekStrip = computeWeekStrip(bootstrap, today);
  const { streak, nextWorkout: rotationNext, activeRoutine, profile } = bootstrap;
  // UX-GYM-12: planned days before setup are never "missed", and the first
  // week's goal is pro-rated to the days left ("0 of 4" on a Friday sign-up).
  const since = setupLocalDate(profile.setupCompletedAt);
  const weekGoal =
    streak.thisWeekGoal > 0
      ? proRatedWeekGoal({ goal: streak.thisWeekGoal, today, setupDate: since })
      : 0;
  const goalMet = weekGoal > 0 && streak.thisWeekSessions >= weekGoal;
  const ringProgress = weekGoal > 0 ? Math.min(1, streak.thisWeekSessions / weekGoal) : 0;
  // Bug B-15: `nextWorkout` always reflects the rotation's next day, which
  // advances the instant Finish runs — `todayStatus` stops Gym Today
  // offering it, with a Start button, on the day it was just finished.
  const status = todayStatus({ bootstrap, today, since });
  // UX-GYM-31: the SAME selector the Food Today card and the Plan use, so a day
  // pinned to today's weekday is named here too (not just the rotation's next).
  const todays = selectTodaysSession({ bootstrap, today, since });
  const nextWorkout =
    todays.kind === 'planned' ? workoutForDay(bootstrap, todays.dayId, today) : rotationNext;
  // The overdue line ("Planned for Monday") belongs to the rotation's next day;
  // when a different day is pinned to today, that one is shown instead.
  const overdueFrom =
    status.kind === 'training' && nextWorkout?.dayId === rotationNext?.dayId
      ? status.overdueFrom
      : undefined;
  const overdueShown = overdueFrom !== undefined;
  const doneCard = status.kind === 'done' ? doneTodayCard({ bootstrap, today }) : null;
  const offer = pickOffer(bootstrap.offers);
  // UX-GYM-13: the recap card used to be dismiss-only; it opens that month's recap.
  const recapMonthKey = offer?.kind === 'recap' ? offer.data?.month : null;
  const recapMonthName = typeof recapMonthKey === 'string' ? monthNameOf(recapMonthKey) : null;
  const recapMonth =
    typeof recapMonthKey === 'string' && recapMonthName
      ? { month: recapMonthKey, name: recapMonthName }
      : null;
  const sortedDays = [...activeRoutine.days].sort((a, b) => a.position - b.position);

  // T-04.8 (UX-04 §7): a planned day earlier this week that never happened —
  // "Still time this week" — never shown during a pause (already excused) or
  // once dismissed ("Not this week" changes nothing, D22).
  const weekStart = weekStartOf(today);
  // `missedDismissTick` isn't read below — bumping it forces this plain
  // (non-memoised) computation to re-run and pick up the new KV write.
  void missedDismissTick;
  // The rotation's own next day is never listed here: when it's the missed
  // one, the main card already offers it as today's workout (`overdueFrom`).
  // Listing it too gave "Move it to Wednesday" a setNextDay to the day that
  // was already next — a silent no-op (owner dogfood 2026-09-29).
  const missed = missedPlannedDays({
    activeRoutine,
    recentSessions: bootstrap.recentSessions,
    today,
    since,
  }).filter(
    (d) =>
      d.dayId !== nextWorkout?.dayId &&
      !(overdueShown && d.dayId === rotationNext?.dayId) &&
      !isMissedDayDismissed(weekStart, d.dayId),
  );
  const firstMissed = missed[0] ?? null;
  const doneToday = status.kind === 'done';

  // T-36.6: the short version of the next workout for the chosen `Time today:`
  // (null = Full → `shownWorkout` is `nextWorkout` itself, nothing changes).
  const short = nextWorkout
    ? shortVersionOfWorkout(nextWorkout, libraryLookup(bootstrap), timeToday)
    : null;
  const shownWorkout = short?.workout ?? nextWorkout;

  const handleMissedPrimary = (day: { dayId: string; dayName: string }) => {
    if (!doneToday) {
      startDay(day.dayId);
      return;
    }
    // Already trained today: queue it up as the next session instead.
    setNextDayMutation.mutate(
      { routineId: activeRoutine.id, dayId: day.dayId },
      { onSuccess: () => snackbar.show({ message: `${day.dayName} is up next.` }) },
    );
  };
  const handleMissedDismiss = (day: { dayId: string }) => {
    dismissMissedDay(weekStart, day.dayId);
    setMissedDismissTick((t) => t + 1);
    snackbar.show({ message: 'No problem — missing a session changes nothing.' });
  };

  return (
    <Screen className="px-0">
      <ScrollView
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={
          <RefreshControl
            testID="gym-today-refresh"
            refreshing={manualRefreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {header}

        {/* UX-44 (T-44.4, PAT-14): targets that moved after a correction synced. */}
        <TargetChangeNotice bootstrap={bootstrap} dataUpdatedAt={bootstrapQuery.dataUpdatedAt} />

        {activeWorkout.isActive && activeWorkout.session && (
          <ResumeCard bootstrap={bootstrap} session={activeWorkout.session} pausedAt={pausedAt} />
        )}

        <Card className="gap-3">
          <WeekStrip days={weekStrip} />
          <View className="flex-row items-center gap-3">
            <ProgressRing
              progress={ringProgress}
              size={56}
              testID="gym-today-week-ring"
              accessibilityLabel={`${streak.thisWeekSessions} of ${weekGoal} this week`}
            >
              <Text className="text-xs font-semibold">
                {goalMet ? '✓' : `${streak.thisWeekSessions}/${weekGoal}`}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium">
                {goalMet
                  ? `Weekly goal met · ${streak.thisWeekSessions} ${streak.thisWeekSessions === 1 ? 'session' : 'sessions'}`
                  : `${streak.thisWeekSessions} of ${weekGoal} this week`}
              </Text>
              <Text testID="gym-today-streak" variant="muted" className="text-sm">
                {formatStreakLine(streak)}
              </Text>
            </View>
          </View>
          <Pressable
            testID="gym-today-how-this-works"
            accessibilityRole="button"
            onPress={() => setHowThisWorksVisible(true)}
            className="min-h-11 justify-center self-start"
          >
            <Text className="text-sm font-medium text-primary">How this works</Text>
          </Pressable>
        </Card>

        {!bootstrap.activePause && firstMissed && !overdueShown ? (
          <Card testID="gym-today-missed" className="gap-2">
            <Text className="font-semibold">Still time this week</Text>
            <Text variant="muted" className="text-sm">
              {missed.length === 1
                ? `${firstMissed.dayName} hasn’t happened yet this week.`
                : `${missed.map((d) => d.dayName).join(' and ')} haven’t happened yet this week.`}
            </Text>
            <View className="flex-row flex-wrap gap-3">
              <Button
                testID="gym-today-missed-primary"
                size="sm"
                disabled={doneToday && !onlineManager.isOnline()}
                loading={setNextDayMutation.isPending}
                onPress={() => handleMissedPrimary(firstMissed)}
              >
                {doneToday ? 'Make it next' : 'Do it today'}
              </Button>
              <Pressable
                testID="gym-today-missed-dismiss"
                accessibilityRole="button"
                onPress={() => handleMissedDismiss(firstMissed)}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-primary">Not this week</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {bootstrap.activePause ? (
          <Card testID="gym-today-paused" className="gap-2">
            <Text className="font-semibold">Training paused</Text>
            <Text variant="muted" className="text-sm">
              {`Resumes ${bootstrap.activePause.endDate}${bootstrap.activePause.reason ? ` · ${bootstrap.activePause.reason}` : ''}`}
            </Text>
            <Button
              testID="gym-today-end-pause"
              variant="outline"
              loading={pauseEndMutation.isPending}
              onPress={() => pauseEndMutation.mutate({ id: bootstrap.activePause?.id ?? '' })}
            >
              End pause
            </Button>
          </Card>
        ) : status.kind === 'done' && doneCard ? (
          <Card testID="gym-today-done" className="gap-2">
            <Text className="font-semibold">✓ Done today</Text>
            <Text variant="muted" className="text-sm">
              {doneCard.session.name} · {doneCard.durationMin} min · {doneCard.workingSets} sets
              {doneCard.prCount > 0
                ? ` · ${doneCard.prCount} PR${doneCard.prCount > 1 ? 's' : ''}`
                : ''}
            </Text>
            {doneCard.next && (
              <Text testID="gym-today-done-next" variant="muted" className="text-xs">
                Next session: {weekdayLabel(doneCard.next.weekday)} — {doneCard.next.dayName}
              </Text>
            )}
            <Button
              testID="gym-today-done-summary"
              onPress={() =>
                router.push({
                  pathname: '/gym/summary/[id]',
                  params: { id: doneCard.session.id },
                })
              }
            >
              See summary
            </Button>
            <Pressable
              testID="gym-today-done-pick-day"
              accessibilityRole="button"
              onPress={() => setDayPickerVisible(true)}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-primary">
                Train again today? Pick a day
              </Text>
            </Pressable>
          </Card>
        ) : status.kind === 'rest' && todays.kind !== 'planned' && nextWorkout ? (
          <Card testID="gym-today-rest" className="gap-2">
            <Text className="font-semibold">Rest day</Text>
            <Text variant="muted" className="text-sm">
              Next session: {weekdayLabel(status.weekday)} — {status.dayName}. Rest counts too.
            </Text>
            <Button
              testID="gym-today-rest-start-anyway"
              variant="outline"
              onPress={() => startPlanned(nextWorkout)}
            >
              {`Start ${status.dayName} anyway`}
            </Button>
            <Pressable
              testID="gym-today-rest-pick-day"
              accessibilityRole="button"
              onPress={() => setDayPickerVisible(true)}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-primary">
                Train something else? Pick a day or freestyle
              </Text>
            </Pressable>
          </Card>
        ) : nextWorkout && short && shownWorkout ? (
          <Card testID="gym-today-next-up" className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold">{shownWorkout.dayName}</Text>
              <Text variant="muted" className="text-xs">
                ~{shownWorkout.estimatedMin} min
              </Text>
            </View>
            {overdueFrom !== undefined ? (
              <Text testID="gym-today-overdue" variant="muted" className="-mt-2 text-xs">
                {`Planned for ${weekdayLabel(overdueFrom)} — today works just as well.`}
              </Text>
            ) : null}
            <View className="gap-1.5">
              {(() => {
                const runs = supersetRuns(shownWorkout.exercises);
                return shownWorkout.exercises.map((ex, i) => {
                  const slot = supersetSlot(shownWorkout.exercises, i);
                  const run = slot?.position === 0 ? runs.find((r) => r.start === i) : undefined;
                  const lastRest = run ? shownWorkout.exercises[run.end]?.restSec : undefined;
                  return (
                    <View key={ex.routineExerciseId} className="gap-1">
                      {run && slot ? (
                        <View
                          testID={`gym-today-next-up-superset-${slot.label}`}
                          className="flex-row items-center gap-2 pt-1"
                        >
                          <Text className="text-xs font-semibold text-violet-800">
                            Superset {slot.label}
                          </Text>
                          <Text
                            variant="muted"
                            className="min-w-0 flex-1 text-xs"
                            numberOfLines={2}
                          >
                            {lastRest ?? ex.restSec} s rest after each round
                          </Text>
                        </View>
                      ) : null}
                      <View
                        className={cn(
                          'flex-row items-center justify-between',
                          slot && 'border-l-4 border-l-violet-500 pl-2',
                        )}
                      >
                        <View className="min-w-0 flex-1 flex-row items-center gap-1.5 pr-2">
                          {slot ? (
                            <View className="rounded bg-violet-100 px-1 py-0.5">
                              <RNText
                                testID={`gym-today-next-up-${ex.routineExerciseId}-superset`}
                                className="text-xs font-bold text-violet-800"
                              >
                                {slot.label}
                                {slot.position + 1}
                              </RNText>
                            </View>
                          ) : null}
                          <ExerciseNameLink
                            testID={`gym-today-next-up-${ex.routineExerciseId}-name`}
                            exerciseId={ex.exerciseId}
                            name={libraryLookup(bootstrap)(ex.exerciseId)?.name ?? ex.exerciseId}
                            numberOfLines={2}
                            className="flex-1"
                            textClassName="text-base"
                          />
                        </View>
                        {/* WP-04: the target may wrap at large OS text, so it is
                            capped instead of squeezing the name to nothing. */}
                        <Text variant="muted" className="max-w-[40%] shrink-0 text-right text-sm">
                          {formatTarget(ex, bootstrap, profile.unit)}
                        </Text>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
            <TimeTodayChips
              value={timeToday}
              onChange={handleTimeTodayChange}
              preview={
                short.isShort
                  ? { minutes: short.minutes, exerciseCount: short.exerciseCount }
                  : null
              }
            />
            {/* WP-04: Start workout and Freestyle are the busy-hands primaries → lg. */}
            <Button
              testID="gym-today-start"
              size="lg"
              onPress={() => startPlanned(shownWorkout, short.carryOverExerciseIds)}
            >
              Start workout
            </Button>
            <Text variant="muted" className="text-xs">
              Not feeling an exercise? Swap, skip or add one from its ⋯ menu as you go.
            </Text>
            <View className="flex-row flex-wrap gap-x-4 gap-y-2">
              <Pressable
                testID="gym-today-pick-day"
                accessibilityRole="button"
                onPress={() => setDayPickerVisible(true)}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-primary">Do another day instead</Text>
              </Pressable>
              <Pressable
                testID="gym-today-skip"
                accessibilityRole="button"
                disabled={!onlineManager.isOnline()}
                onPress={handleSkip}
                className="min-h-11 justify-center disabled:opacity-40"
              >
                <Text className="text-sm font-medium text-primary">Skip this day</Text>
              </Pressable>
            </View>
            <Button
              testID="gym-today-freestyle"
              size="lg"
              variant="outline"
              onPress={startFreestyle}
            >
              Freestyle workout
            </Button>
          </Card>
        ) : (
          <EmptyState
            testID="gym-today-restweek"
            title="Nothing planned today"
            description="Rest, or start a freestyle session whenever you like."
            action={{
              label: 'Freestyle workout',
              testID: 'gym-today-freestyle',
              onPress: startFreestyle,
            }}
          />
        )}

        {offer && (
          <Card testID="gym-today-offer" className="gap-2">
            <Text className="font-semibold">{offer.title}</Text>
            <Text variant="muted" className="text-sm">
              {offer.body}
            </Text>
            <View className="flex-row gap-3">
              {offer.kind === 'deload' && (
                <Button
                  testID="gym-today-offer-accept"
                  size="sm"
                  loading={startDeloadMutation.isPending}
                  onPress={() => startDeloadMutation.mutate()}
                >
                  Take it
                </Button>
              )}
              {offer.kind === 'recap' && recapMonth ? (
                <Button
                  testID="gym-today-offer-recap"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: '/stats', params: { month: recapMonth.month } })
                  }
                >
                  {`See ${recapMonth.name}`}
                </Button>
              ) : null}
              <Button
                testID="gym-today-offer-dismiss"
                size="sm"
                variant="outline"
                onPress={() => handleDismissOffer(offer)}
              >
                Dismiss
              </Button>
            </View>
          </Card>
        )}

        <LogPastWorkoutAction bootstrap={bootstrap} />

        <RecentWorkouts bootstrap={bootstrap} />

        {/* UX-GYM-01: a workout the server rejected (or that failed local
            validation) used to sit parked behind a grey "1 item needs
            attention" line while Today still said "Done". Say what is wrong
            and let the user fix the set. */}
        {outboxStatus.parked.map((entry) => (
          <Card
            key={entry.doc.id}
            testID={`gym-today-parked-${entry.doc.id}`}
            className="gap-2 border border-amber-300 bg-amber-50"
          >
            <Text className="font-semibold text-amber-900">{`${entry.doc.name} didn't save`}</Text>
            <Text testID={`gym-today-parked-${entry.doc.id}-reason`} className="text-sm">
              {entry.parkedReason}
            </Text>
            <View className="flex-row gap-2">
              {entry.doc.status === 'COMPLETED' ? (
                <Button
                  testID={`gym-today-parked-${entry.doc.id}-fix`}
                  size="sm"
                  onPress={() => router.push(`/gym/workout?edit=${entry.doc.id}`)}
                >
                  Fix it
                </Button>
              ) : null}
              <Button
                testID={`gym-today-parked-${entry.doc.id}-details`}
                size="sm"
                variant="outline"
                onPress={() => router.push('/gym/settings')}
              >
                Retry or discard
              </Button>
            </View>
          </Card>
        ))}

        {/* UX-GYM-25: how many are waiting, why the last try failed, Sync now. */}
        <OutboxWaitingCard status={outboxStatus} testID="gym-today-outbox" />
      </ScrollView>

      {activeWorkout.session ? (
        <StartConflictSheet
          visible={pendingStart !== null}
          onClose={() => setPendingStart(null)}
          session={activeWorkout.session}
          targetName={pendingStart?.targetName ?? 'a new workout'}
          onResume={handleConflictResume}
          onFinishAndStart={() => void handleConflictFinishAndStart()}
          onDiscardAndStart={handleConflictDiscardAndStart}
        />
      ) : null}

      <Sheet
        visible={dayPickerVisible}
        onClose={() => setDayPickerVisible(false)}
        title="Choose a day"
        testID="gym-today-day-picker"
      >
        {sortedDays.map((day) => (
          <Pressable
            key={day.id}
            testID={`gym-today-day-${day.id}`}
            accessibilityRole="button"
            onPress={() => handlePickDay(day.id)}
            className="min-h-11 justify-center border-b border-border py-3"
          >
            <Text className="font-medium">{day.name}</Text>
          </Pressable>
        ))}
        <Pressable
          testID="gym-today-day-freestyle"
          accessibilityRole="button"
          onPress={handlePickFreestyle}
          className="min-h-11 justify-center py-3"
        >
          <Text className="font-medium text-primary">Freestyle — build it as you go</Text>
        </Pressable>
      </Sheet>

      <HowThisWorksSheet
        visible={howThisWorksVisible}
        onClose={() => setHowThisWorksVisible(false)}
      />
    </Screen>
  );
}
