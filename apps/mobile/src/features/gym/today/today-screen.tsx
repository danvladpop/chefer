import { useState } from 'react';
import { Pressable, RefreshControl, Text as RNText, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, ProgressRing, Screen, Sheet, Text } from '@chefer/ui-mobile';
import { cn, pauseSummaryLine, supersetRuns, supersetSlot } from '@chefer/utils';
import { useShellV2 } from '../../shell/shell-store';
import { TrainLinks } from '../../shell/train-links';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { GymBootstrapUnavailable } from '../components/gym-bootstrap-state';
import { ModeSwitch } from '../components/mode-switch';
import { OutboxWaitingCard } from '../components/outbox-waiting-card';
import { weekdayLabel } from '../routine/weekday';
import { libraryLookup } from '../use-gym-bootstrap';
import { HowThisWorksSheet } from './how-this-works-sheet';
import { LogActivityAction } from './log-activity-sheet';
import { LogPastWorkoutAction } from './log-past-workout';
import { RecentWorkouts } from './recent-workouts';
import { ResumeCard } from './resume-card';
import { StartConflictSheet } from './start-conflict-sheet';
import { TargetChangeNotice } from './target-change-notice';
import { TimeTodayChips } from './time-today-chips';
import {
  formatStreakLine,
  formatTarget,
  weekStripDayLabel,
  type WeekStripDay,
} from './today-helpers';
import { useTrainToday } from './use-train-today';

// Gym Today tab (gym_plan.md §1.3 "Today tab"). The persisted bootstrap drives
// everything here. Picking a day ("Do another day instead", "Train again
// today?", a missed day's "Do it today") starts it straight away, built
// locally by the shared engine so it works the same online and offline (D6);
// only "Skip" and "Make it next" move the server's rotation pointer.
// Owner dogfood 2026-09-29: every state offers another day or freestyle —
// real weeks rarely follow the plan to the letter.

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekStrip({ days, today }: { days: WeekStripDay[]; today: string }) {
  return (
    <View testID="gym-today-week-strip" className="flex-row justify-between">
      {days.map((day, i) => (
        <View
          key={day.localDate}
          testID={`gym-today-week-strip-${day.weekday}`}
          // UX-GYM-29: the dot is colour-only, so each day reads as one label.
          accessible
          accessibilityLabel={weekStripDayLabel(day, today)}
          className="items-center gap-1"
        >
          <Text variant="muted" className="text-xs" importantForAccessibility="no">
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
  const shellV2 = useShellV2();
  const [howThisWorksVisible, setHowThisWorksVisible] = useState(false);
  const {
    online,
    bootstrapQuery,
    bootstrap,
    bootstrapLoad,
    starts,
    activeWorkout,
    pausedAt,
    outboxStatus,
    dayPickerVisible,
    setDayPickerVisible,
    timeToday,
    handleTimeTodayChange,
    manualRefreshing,
    handleRefresh,
    setNextDayMutation,
    startDeloadMutation,
    pauseEndMutation,
    handlePickDay,
    handlePickFreestyle,
    handleSkip,
    handleDismissOffer,
    handleMissedPrimary,
    handleMissedDismiss,
    today,
    view,
  } = useTrainToday();
  const {
    pendingStart,
    setPendingStart,
    startPlanned,
    startFreestyle,
    handleConflictResume,
    handleConflictFinishAndStart,
    handleConflictDiscardAndStart,
  } = starts;

  const header = (
    <View className="gap-1">
      <ModeSwitch mode="gym" />
      <Text testID="gym-today-title" variant="title" className="mt-1">
        {shellV2 ? 'Train' : 'Today'}
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

  if (!bootstrap.activeRoutine || !view) {
    // UX-GYM-15: archiving the active routine must not hide the history — Recent
    // workouts and "Log a workout you already did" stay (they need no routine).
    return (
      <Screen className="px-0">
        <ScrollView contentContainerClassName="gap-4 px-4 py-4">
          {header}
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
          <LogPastWorkoutAction bootstrap={bootstrap} />
          <LogActivityAction bootstrap={bootstrap} />
          <RecentWorkouts bootstrap={bootstrap} />
          {shellV2 ? <TrainLinks /> : null}
        </ScrollView>
      </Screen>
    );
  }

  const {
    weekStrip,
    streak,
    weekGoal,
    firstWeekNote,
    goalMet,
    ringProgress,
    status,
    todays,
    nextWorkout,
    overdueFrom,
    overdueShown,
    doneCard,
    offer,
    recapMonth,
    sortedDays,
    missed,
    firstMissed,
    doneToday,
    short,
    shownWorkout,
    profile,
  } = view;

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
          <WeekStrip days={weekStrip} today={today} />
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
                  : `${streak.thisWeekSessions} of ${weekGoal} this week${firstWeekNote}`}
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
                disabled={doneToday && !online}
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
              {pauseSummaryLine(bootstrap.activePause, today)}
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
                disabled={!online}
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

        {/* Two quiet text links, side by side — neither competes with Start. */}
        <View className="flex-row flex-wrap items-center gap-x-6">
          <LogPastWorkoutAction bootstrap={bootstrap} />
          <LogActivityAction bootstrap={bootstrap} />
        </View>

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
        {/* Mobile UX revamp: the old Gym tabs, one tap down from Train. */}
        {shellV2 ? <TrainLinks /> : null}
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
