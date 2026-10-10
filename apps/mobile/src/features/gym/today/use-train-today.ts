import { useCallback, useState } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import type { GymBootstrap, GymOffer, NextWorkoutDto } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import {
  doneTodayCard,
  missedPlannedDays,
  monthNameOf,
  proRatedWeekGoal,
  selectTodaysSession,
  shortVersionOfWorkout,
  todayStatus,
  weekStartOf,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { captureGymEvent } from '../analytics';
import { useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { useIsOnline } from '../library-screens/online-status';
import { useActiveSessionPausedAt } from '../offline/active-session-store';
import { localDate } from '../offline/ids';
import { useOutboxStatus } from '../offline/outbox';
import { useGymReminders } from '../reminders/use-gym-reminders';
import { checkPausedWorkoutTimeout, useActiveWorkout } from '../use-active-workout';
import { gymBootstrapQueryKey, libraryLookup, useGymBootstrap } from '../use-gym-bootstrap';
import { dismissMissedDay, isMissedDayDismissed } from './missed-day-dismissed';
import { getTimeToday, setTimeToday } from './time-today';
import { computeWeekStrip, pickOffer, setupLocalDate, workoutForDay } from './today-helpers';
import { useTimedRefresh } from './use-timed-refresh';

// The state and actions behind Gym Today (legacy Food|Gym shell) and Train
// (10 Oct redesign, new shell). Both screens render from this one hook, so
// the two shells can never disagree about what today's workout is, what a
// start does when a workout is already open, or what Skip / Not this week do.

/** A start that waits for the "workout already in progress" answer (UX-GYM-02). */
export interface PendingStart {
  targetName: string;
  run: () => void;
}

/**
 * UX-GYM-02: `startWorkout` hands back the EXISTING session when one is in
 * progress, so a start tap used to land in the old workout with no word. Any
 * start while one is open parks here and the conflict sheet asks: Resume /
 * Finish & start / Discard & start. Shared by Train, Gym Today and Routine.
 */
export function useGuardedStart() {
  const activeWorkout = useActiveWorkout();
  const snackbar = useSnackbar();
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);

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
  const startDay = (bootstrap: GymBootstrap | undefined, dayId: string) => {
    if (!bootstrap) return;
    const workout = workoutForDay(bootstrap, dayId, localDate());
    if (workout) startPlanned(workout);
  };

  return {
    activeWorkout,
    pendingStart,
    setPendingStart,
    guardStart,
    startPlanned,
    startFreestyle,
    startDay,
    handleConflictResume,
    handleConflictFinishAndStart,
    handleConflictDiscardAndStart,
  };
}

export type GuardedStart = ReturnType<typeof useGuardedStart>;

/**
 * Everything Gym Today / Train show for a set-up profile with an active
 * routine. Plain (non-memoised) on purpose: the missed-day dismissal is a KV
 * write, re-read on the next render.
 */
export function deriveTrainToday(bootstrap: GymBootstrap, today: string, timeToday: number | null) {
  const activeRoutine = bootstrap.activeRoutine;
  const profile = bootstrap.profile;
  if (!activeRoutine || !profile) return null;
  const weekStrip = computeWeekStrip(bootstrap, today);
  const { streak, nextWorkout: rotationNext } = bootstrap;
  // UX-GYM-12: planned days before setup are never "missed", and the first
  // week's goal is pro-rated to the days left ("0 of 4" on a Friday sign-up).
  const since = setupLocalDate(profile.setupCompletedAt);
  const weekGoal =
    streak.thisWeekGoal > 0
      ? proRatedWeekGoal({ goal: streak.thisWeekGoal, today, setupDate: since })
      : 0;
  // The pro-rated first week explains itself: "0 of 2 this week · 3 from next week".
  const firstWeekNote =
    weekGoal < streak.thisWeekGoal ? ` · ${streak.thisWeekGoal} from next week` : '';
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

  return {
    activeRoutine,
    profile,
    streak,
    weekStrip,
    weekGoal,
    firstWeekNote,
    goalMet,
    ringProgress,
    status,
    todays,
    rotationNext,
    nextWorkout,
    overdueFrom,
    overdueShown,
    doneCard,
    offer,
    recapMonth,
    sortedDays,
    weekStart,
    missed,
    firstMissed,
    doneToday,
    short,
    shownWorkout,
  };
}

export type TrainTodayView = NonNullable<ReturnType<typeof deriveTrainToday>>;

/** Gym Today / Train: data, the guarded starts, and every card action. */
export function useTrainToday() {
  const queryClient = useQueryClient();
  // UX-GYM-29: online-only buttons re-render when connectivity changes.
  const online = useIsOnline();
  useGymReminders();
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const starts = useGuardedStart();
  const pausedAt = useActiveSessionPausedAt();
  const outboxStatus = useOutboxStatus();
  const snackbar = useSnackbar();
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
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

  const handleTimeTodayChange = (minutes: number | null) => {
    setTimeTodayState(minutes);
    setTimeToday(localDate(), minutes);
    captureGymEvent('session_time_chosen', { minutes, where: 'start' });
  };

  const startDay = (dayId: string) => starts.startDay(bootstrap, dayId);

  const handlePickDay = (dayId: string) => {
    setDayPickerVisible(false);
    startDay(dayId);
  };

  const handlePickFreestyle = () => {
    setDayPickerVisible(false);
    starts.startFreestyle();
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

  const today = localDate();
  // `missedDismissTick` isn't read below — bumping it forces this plain
  // (non-memoised) computation to re-run and pick up the new KV write.
  void missedDismissTick;
  const view = bootstrap ? deriveTrainToday(bootstrap, today, timeToday) : null;

  const handleMissedPrimary = (day: { dayId: string; dayName: string }) => {
    if (!view) return;
    if (!view.doneToday) {
      startDay(day.dayId);
      return;
    }
    // Already trained today: queue it up as the next session instead.
    setNextDayMutation.mutate(
      { routineId: view.activeRoutine.id, dayId: day.dayId },
      { onSuccess: () => snackbar.show({ message: `${day.dayName} is up next.` }) },
    );
  };
  const handleMissedDismiss = (day: { dayId: string }) => {
    dismissMissedDay(weekStartOf(today), day.dayId);
    setMissedDismissTick((t) => t + 1);
    snackbar.show({ message: 'No problem — missing a session changes nothing.' });
  };

  return {
    online,
    bootstrapQuery,
    bootstrap,
    bootstrapLoad,
    starts,
    activeWorkout: starts.activeWorkout,
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
    startDay,
    handlePickDay,
    handlePickFreestyle,
    handleSkip,
    handleDismissOffer,
    handleMissedPrimary,
    handleMissedDismiss,
    today,
    view,
  };
}

export type TrainToday = ReturnType<typeof useTrainToday>;
