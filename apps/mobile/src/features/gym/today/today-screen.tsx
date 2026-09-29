import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text as RNText,
  ScrollView,
  View,
} from 'react-native';
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
  buildNextWorkout,
  cn,
  doneTodayCard,
  equipmentProfileOf,
  missedPlannedDays,
  progressionKey,
  supersetRuns,
  supersetSlot,
  todayStatus,
  weekStartOf,
  type ProgressionEntry,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { ModeSwitch } from '../components/mode-switch';
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
import {
  computeWeekStrip,
  formatStreakLine,
  formatTarget,
  pickOffer,
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
          <Text variant="muted" className="text-[12px]">
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
  const activeWorkout = useActiveWorkout();
  const pausedAt = useActiveSessionPausedAt();
  const outboxStatus = useOutboxStatus();
  const snackbar = useSnackbar();
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
  const [howThisWorksVisible, setHowThisWorksVisible] = useState(false);
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });

  const startPlanned = (workout: NextWorkoutDto) => {
    activeWorkout.start({ kind: 'planned', workout });
    router.push('/gym/workout');
  };

  const startFreestyle = () => {
    activeWorkout.start({ kind: 'freestyle' });
    router.push('/gym/workout');
  };

  // Starts `dayId` now. Used to only move the server's rotation pointer when
  // online, which on a rest day just re-rendered "Rest day" for the picked
  // day — the user could never actually start it. Finishing the session
  // advances the rotation from this day either way.
  const startDay = (dayId: string) => {
    if (!bootstrap?.activeRoutine || !bootstrap.profile) return;
    if (bootstrap.nextWorkout?.dayId === dayId) {
      // The server-built workout already carries "From last time" exercises.
      startPlanned(bootstrap.nextWorkout);
      return;
    }
    const progressions = new Map<string, ProgressionEntry>(
      bootstrap.progressions.map((p) => [
        progressionKey(p.exerciseId, p.repBucket),
        { state: p.state, override: p.override },
      ]),
    );
    const workout = buildNextWorkout({
      routine: bootstrap.activeRoutine,
      dayId,
      lookup: libraryLookup(bootstrap),
      progressions,
      profile: equipmentProfileOf(bootstrap.profile),
      facts: { experience: bootstrap.profile.experience, ageYears: null },
      today: localDate(),
      recentSessions: bootstrap.recentSessions,
      isDeload: false,
    });
    startPlanned(workout);
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
      <ModeSwitch />
      <Text testID="gym-today-title" variant="title" className="mt-1">
        Today
      </Text>
    </View>
  );

  if (!bootstrap) {
    return (
      <Screen className="px-0">
        <View className="gap-4 px-4 pt-3">{header}</View>
        {bootstrapQuery.fetchStatus === 'paused' ? (
          <EmptyState
            testID="gym-today-empty-offline"
            title="Needs a connection"
            description="Your first sync with the gym needs a connection. Reconnect and try again."
            action={{
              label: 'Try again',
              onPress: () => void bootstrapQuery.refetch(),
              testID: 'gym-today-retry',
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center" testID="gym-today-loading">
            <ActivityIndicator size="large" color="#944a00" />
          </View>
        )}
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
  const { streak, nextWorkout, activeRoutine, profile } = bootstrap;
  const goalMet = streak.thisWeekGoal > 0 && streak.thisWeekSessions >= streak.thisWeekGoal;
  const ringProgress = streak.thisWeekGoal > 0 ? streak.thisWeekSessions / streak.thisWeekGoal : 0;
  // Bug B-15: `nextWorkout` always reflects the rotation's next day, which
  // advances the instant Finish runs — `todayStatus` stops Gym Today
  // offering it, with a Start button, on the day it was just finished.
  const status = todayStatus({ bootstrap, today });
  const doneCard = status.kind === 'done' ? doneTodayCard({ bootstrap, today }) : null;
  const offer = pickOffer(bootstrap.offers);
  const showOutbox = outboxStatus.pending > 0 || outboxStatus.parked.length > 0;
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
  }).filter((d) => d.dayId !== nextWorkout?.dayId && !isMissedDayDismissed(weekStart, d.dayId));
  const firstMissed = missed[0] ?? null;
  const doneToday = status.kind === 'done';

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
              accessibilityLabel={`${streak.thisWeekSessions} of ${streak.thisWeekGoal} this week`}
            >
              <Text className="text-xs font-semibold">
                {goalMet ? '✓' : `${streak.thisWeekSessions}/${streak.thisWeekGoal}`}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium">
                {goalMet
                  ? `Weekly goal met · ${streak.thisWeekSessions} ${streak.thisWeekSessions === 1 ? 'session' : 'sessions'}`
                  : `${streak.thisWeekSessions} of ${streak.thisWeekGoal} this week`}
              </Text>
              <Text testID="gym-today-streak" variant="muted" className="text-xs">
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
            <Text className="text-xs font-medium text-primary">How this works</Text>
          </Pressable>
        </Card>

        {!bootstrap.activePause && firstMissed ? (
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
        ) : status.kind === 'rest' && nextWorkout ? (
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
        ) : nextWorkout ? (
          <Card testID="gym-today-next-up" className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold">{nextWorkout.dayName}</Text>
              <Text variant="muted" className="text-xs">
                ~{nextWorkout.estimatedMin} min
              </Text>
            </View>
            {status.kind === 'training' && status.overdueFrom !== undefined ? (
              <Text testID="gym-today-overdue" variant="muted" className="-mt-2 text-xs">
                {`Planned for ${weekdayLabel(status.overdueFrom)} — today works just as well.`}
              </Text>
            ) : null}
            <View className="gap-1.5">
              {(() => {
                const runs = supersetRuns(nextWorkout.exercises);
                return nextWorkout.exercises.map((ex, i) => {
                  const slot = supersetSlot(nextWorkout.exercises, i);
                  const run = slot?.position === 0 ? runs.find((r) => r.start === i) : undefined;
                  const lastRest = run ? nextWorkout.exercises[run.end]?.restSec : undefined;
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
                            numberOfLines={1}
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
                                className="text-[12px] font-bold text-violet-800"
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
                            numberOfLines={1}
                            className="flex-1"
                            textClassName="text-sm"
                          />
                        </View>
                        <Text variant="muted" className="text-xs">
                          {formatTarget(ex, bootstrap, profile.unit)}
                        </Text>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
            <Button testID="gym-today-start" onPress={() => startPlanned(nextWorkout)}>
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
              <Pressable
                testID="gym-today-freestyle"
                accessibilityRole="button"
                onPress={startFreestyle}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-primary">Freestyle workout</Text>
              </Pressable>
            </View>
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

        {showOutbox && (
          <Pressable
            testID="gym-today-outbox"
            accessibilityRole="button"
            onPress={() => router.push('/gym/settings')}
            className="min-h-11 justify-center rounded-lg bg-muted px-4 py-3"
          >
            <Text className="text-xs text-muted-foreground">
              {outboxStatus.parked.length > 0
                ? `${outboxStatus.parked.length} item${outboxStatus.parked.length === 1 ? '' : 's'} need attention`
                : `${outboxStatus.pending} workout${outboxStatus.pending === 1 ? '' : 's'} waiting to sync`}
            </Text>
          </Pressable>
        )}
      </ScrollView>

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
