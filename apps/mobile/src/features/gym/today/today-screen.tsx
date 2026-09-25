import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text as RNText,
  ScrollView,
  View,
} from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, GymOffer, NextWorkoutDto } from '@chefer/types';
import { Button, Card, EmptyState, ProgressRing, Screen, Sheet, Text } from '@chefer/ui-mobile';
import {
  buildNextWorkout,
  cn,
  equipmentProfileOf,
  progressionKey,
  supersetRuns,
  supersetSlot,
  type ProgressionEntry,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { ModeSwitch } from '../components/mode-switch';
import { localDate } from '../offline/ids';
import { useOutboxStatus } from '../offline/outbox';
import { useGymReminders } from '../reminders/use-gym-reminders';
import { useActiveWorkout } from '../use-active-workout';
import { gymBootstrapQueryKey, libraryLookup, useGymBootstrap } from '../use-gym-bootstrap';
import { LogPastWorkoutAction } from './log-past-workout';
import {
  computeWeekStrip,
  formatStreakLine,
  formatTarget,
  pickOffer,
  type WeekStripDay,
} from './today-helpers';

// Gym Today tab (gym_plan.md §1.3 "Today tab"). The persisted bootstrap drives
// everything here; "Do another day" and "Skip" only touch the server (§5.4
// scope — routine editing needs a connection), while offline the shared
// engine builds the picked day locally so a basement gym never blocks a
// workout (D6).

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
  const outboxStatus = useOutboxStatus();
  const [dayPickerVisible, setDayPickerVisible] = useState(false);

  const setNextDayMutation = trpc.gym.routine.setNextDay.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });
  const dismissOfferMutation = trpc.gym.progression.dismissOffer.useMutation();
  const startDeloadMutation = trpc.gym.progression.startDeload.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });

  const startPlanned = (workout: NextWorkoutDto) => {
    activeWorkout.start({ kind: 'planned', workout });
    router.push('/gym/workout');
  };

  const handlePickDay = (dayId: string) => {
    setDayPickerVisible(false);
    if (!bootstrap?.activeRoutine || !bootstrap.profile) return;
    if (onlineManager.isOnline()) {
      setNextDayMutation.mutate({ routineId: bootstrap.activeRoutine.id, dayId });
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

  const handleSkip = () => {
    if (!bootstrap?.activeRoutine) return;
    const days = [...bootstrap.activeRoutine.days].sort((a, b) => a.position - b.position);
    const idx = bootstrap.nextWorkout
      ? days.findIndex((d) => d.id === bootstrap.nextWorkout?.dayId)
      : -1;
    const after = days[(idx + 1) % days.length] ?? days[0];
    if (after) {
      setNextDayMutation.mutate({ routineId: bootstrap.activeRoutine.id, dayId: after.id });
    }
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

  const weekStrip = computeWeekStrip(bootstrap, localDate());
  const { streak, nextWorkout, activeRoutine, profile } = bootstrap;
  const goalMet = streak.thisWeekGoal > 0 && streak.thisWeekSessions >= streak.thisWeekGoal;
  const ringProgress = streak.thisWeekGoal > 0 ? streak.thisWeekSessions / streak.thisWeekGoal : 0;
  const offer = pickOffer(bootstrap.offers);
  const lastSession = bootstrap.recentSessions[0];
  const showOutbox = outboxStatus.pending > 0 || outboxStatus.parked.length > 0;
  const sortedDays = [...activeRoutine.days].sort((a, b) => a.position - b.position);

  return (
    <Screen className="px-0">
      <ScrollView
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={
          <RefreshControl
            refreshing={bootstrapQuery.isRefetching}
            onRefresh={() => void bootstrapQuery.refetch()}
          />
        }
      >
        {header}

        {activeWorkout.isActive && (
          <Card testID="gym-today-resume" className="border-primary/30 bg-accent">
            <Text className="font-semibold text-primary">Resume workout</Text>
            <Text variant="muted" className="mt-0.5 text-sm">
              {activeWorkout.session?.name}
            </Text>
            <Button
              testID="gym-today-resume-button"
              className="mt-3"
              onPress={() => router.push('/gym/workout')}
            >
              Resume
            </Button>
          </Card>
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
        </Card>

        {nextWorkout ? (
          <Card testID="gym-today-next-up" className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold">{nextWorkout.dayName}</Text>
              <Text variant="muted" className="text-xs">
                ~{nextWorkout.estimatedMin} min
              </Text>
            </View>
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
                          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm">
                            {libraryLookup(bootstrap)(ex.exerciseId)?.name ?? ex.exerciseId}
                          </Text>
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
                onPress={() => {
                  activeWorkout.start({ kind: 'freestyle' });
                  router.push('/gym/workout');
                }}
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
              onPress: () => {
                activeWorkout.start({ kind: 'freestyle' });
                router.push('/gym/workout');
              },
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

        {lastSession && (
          <Pressable
            testID="gym-today-last-session"
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/gym/session/[id]', params: { id: lastSession.id } })
            }
            className="min-h-11 flex-row items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium">{lastSession.name}</Text>
              <Text variant="muted" className="text-xs">
                {lastSession.localDate}
              </Text>
            </View>
            <Text className="text-primary">→</Text>
          </Pressable>
        )}

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
      </Sheet>
    </Screen>
  );
}
