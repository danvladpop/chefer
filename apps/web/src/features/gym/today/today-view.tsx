'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Dumbbell,
  Flame,
  PauseCircle,
  Play,
  Settings2,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import type { GymOffer, NextWorkoutDto, WeightUnit } from '@chefer/types';
import { Button } from '@chefer/ui';
import { cn, nextDayIdAfter, pickOffer, supersetSlot, type ExerciseLookup } from '@chefer/utils';
import { SupersetHeading } from '../routine/components/SupersetHeading';
import { prescriptionText, shortDate } from '../shared/format';
import { CardLabel, GymCard, GymSkeleton } from '../shared/gym-card';
import { SyncIndicator } from '../shared/sync-indicator';
import { useGymData } from '../shared/use-gym-data';
import { WeekRing } from '../shared/week-ring';
import { weekDays, WeekStrip } from '../shared/week-strip';
import { useActiveWorkout } from '../workout/use-active-workout';
import { sessionProgress } from '../workout/workout-model';
import { buildBackfillWorkout, LogPastWorkoutSheet } from './log-past-workout-sheet';
import { PickDaySheet } from './pick-day-sheet';

// ─── Gym Today (gym_plan.md §1.3) ─────────────────────────────────────────────
// "What do I do today": the resume banner, the week (strip, ring, streak),
// next up with start / another day / skip, at most one contextual card, the
// last session and freestyle. Two columns at lg: the workout on the left,
// the week and context on the right.

export function TodayView() {
  const router = useRouter();
  const { data, lookup, unit, today, ready, isError, refetch } = useGymData();
  const { session, start } = useActiveWorkout();
  const utils = trpc.useUtils();
  const [pickOpen, setPickOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);

  // First visit without a gym profile → the setup flow (gym_plan.md §1.3).
  const needsSetup = ready && data?.profile === null;
  useEffect(() => {
    if (needsSetup) router.replace('/gym/setup');
  }, [needsSetup, router]);

  const setNextDay = trpc.gym.routine.setNextDay.useMutation({
    onSuccess: () => {
      setPickOpen(false);
      void utils.gym.bootstrap.invalidate();
    },
  });

  if (isError) {
    return (
      <Shell>
        <GymCard className="text-center">
          <p className="text-sm text-gray-600">
            Couldn&apos;t load your training. Logging a workout in progress still works offline.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </GymCard>
      </Shell>
    );
  }

  if (!ready || !data || needsSetup) {
    return (
      <Shell>
        <GymSkeleton rows={3} />
      </Shell>
    );
  }

  const routine = data.activeRoutine;
  const next = data.nextWorkout;
  const days = weekDays(data, today);
  const doneToday = data.recentSessions.some(
    (s) => s.status === 'COMPLETED' && s.localDate === today,
  );
  const currentWeek = data.weeks[data.weeks.length - 1];
  const paused = currentWeek?.status === 'paused';
  // Priority order shared with mobile (gym_plan.md §1.3 "Contextual cards"):
  // `data.offers[0]` used to be taken as-is here, which disagreed with the
  // mobile app whenever more than one offer was pending at once (found while
  // verifying the comeback/deload flows end to end — G4-A).
  const offer = pickOffer(data.offers);
  const lastSession = data.recentSessions.find((s) => s.status === 'COMPLETED') ?? null;

  const startPlanned = (workout: NextWorkoutDto) => {
    if (!session) {
      start({ kind: 'planned', workout });
      capture('workout_started', { source: 'next' });
    }
    router.push('/gym/workout');
  };
  const startFreestyle = () => {
    if (!session) {
      start({ kind: 'freestyle' });
      capture('workout_started', { source: 'freestyle' });
    }
    router.push('/gym/workout');
  };

  const startBackfillFreestyle = (backfillDate: string) => {
    if (!session) {
      start({ kind: 'freestyle', name: 'Backfilled workout', backfillDate });
      capture('workout_started', { source: 'freestyle' });
    }
    setBackfillOpen(false);
    router.push('/gym/workout');
  };
  const startBackfillDay = (dayId: string, backfillDate: string) => {
    const workout = buildBackfillWorkout(data, dayId, backfillDate);
    if (!session && workout) {
      start({ kind: 'planned', workout, backfillDate });
      capture('workout_started', { source: 'picked' });
    }
    setBackfillOpen(false);
    router.push('/gym/workout');
  };

  return (
    <Shell>
      {session && (
        <ResumeBanner
          name={session.name}
          progress={sessionProgress(session)}
          onResume={() => router.push('/gym/workout')}
        />
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        {/* Left: what to do today */}
        <div className="flex min-w-0 flex-col gap-4">
          {next && routine ? (
            <NextUpCard
              next={next}
              unit={unit}
              lookup={lookup}
              doneToday={doneToday}
              hasActive={session !== null}
              onStart={() => startPlanned(next)}
              onPickDay={() => setPickOpen(true)}
              onSkip={() => {
                const dayId = nextDayIdAfter(routine, next.dayId);
                if (dayId && dayId !== next.dayId) {
                  setNextDay.mutate({ routineId: routine.id, dayId });
                }
              }}
              busy={setNextDay.isPending}
            />
          ) : (
            <GymCard>
              <CardLabel>Next up</CardLabel>
              <p className="mt-2 text-sm text-gray-600">
                You don&apos;t have an active routine yet. Pick or build one to get a next workout
                here.
              </p>
              <Button asChild className="mt-4">
                <Link href="/gym/routine">Go to Routine</Link>
              </Button>
            </GymCard>
          )}

          {offer && <OfferCard offer={offer} />}

          <GymCard className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Freestyle workout</p>
              <p className="text-xs text-gray-500">Start empty and add exercises as you go.</p>
            </div>
            <Button variant="outline" onClick={startFreestyle} data-testid="gym-freestyle">
              <Dumbbell aria-hidden="true" />
              {session ? 'Resume workout' : 'Start freestyle'}
            </Button>
          </GymCard>

          <button
            type="button"
            data-testid="gym-log-past-workout"
            onClick={() => setBackfillOpen(true)}
            className="min-h-11 self-start text-sm font-medium text-[#944a00] hover:underline"
          >
            Log a past workout
          </button>
        </div>

        {/* Right: the week, the last session */}
        <div className="flex min-w-0 flex-col gap-4">
          <GymCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardLabel>This week</CardLabel>
              {paused && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Paused
                </span>
              )}
            </div>
            <WeekStrip days={days} />
            <div className="mt-4 flex items-center gap-4">
              <WeekRing done={data.streak.thisWeekSessions} goal={data.streak.thisWeekGoal} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900">
                  {data.streak.thisWeekSessions} of {data.streak.thisWeekGoal} this week
                </p>
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <Flame className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
                  <span className="min-w-0">
                    {data.streak.current}-week streak
                    {data.streak.flexTokens > 0 &&
                      ` · ${data.streak.flexTokens} flex week${data.streak.flexTokens === 1 ? '' : 's'} saved`}
                  </span>
                </p>
              </div>
            </div>
          </GymCard>

          {lastSession && (
            <Link
              href={`/gym/summary/${lastSession.id}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-[#944a00]/40"
            >
              <div className="min-w-0">
                <CardLabel>Last session</CardLabel>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {lastSession.name}
                </p>
                <p className="text-xs text-gray-500">
                  {shortDate(lastSession.localDate)} ·{' '}
                  {
                    lastSession.exercises
                      .filter((e) => !e.skipped)
                      .flatMap((e) => e.sets)
                      .filter((s) => !s.isWarmup && s.completed).length
                  }{' '}
                  sets
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            </Link>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <SyncIndicator />
            <Link
              href="/gym/settings"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Gym settings
            </Link>
          </div>
        </div>
      </div>

      {routine && (
        <PickDaySheet
          open={pickOpen}
          onClose={() => setPickOpen(false)}
          routine={routine}
          currentDayId={next?.dayId ?? null}
          busy={setNextDay.isPending}
          onPick={(dayId) => setNextDay.mutate({ routineId: routine.id, dayId })}
        />
      )}

      <LogPastWorkoutSheet
        open={backfillOpen}
        onClose={() => setBackfillOpen(false)}
        data={data}
        today={today}
        onStartFreestyle={startBackfillFreestyle}
        onStartDay={startBackfillDay}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Gym</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Today</h1>
      </div>
      {children}
    </div>
  );
}

function ResumeBanner({
  name,
  progress,
  onResume,
}: {
  name: string;
  progress: { done: number; planned: number };
  onResume: () => void;
}) {
  return (
    <div
      className="sticky top-16 z-20 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#944a00]/30 bg-[#fff8f0] p-3 shadow-sm lg:top-0"
      data-testid="gym-resume-banner"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">Workout in progress: {name}</p>
        <p className="text-xs text-gray-600">
          {progress.done} of {progress.planned} sets done
        </p>
      </div>
      <Button onClick={onResume} className="shrink-0 bg-[#944a00] hover:bg-[#7a3d00]">
        <Play aria-hidden="true" />
        Resume
      </Button>
    </div>
  );
}

export function NextUpCard({
  next,
  unit,
  lookup,
  doneToday,
  hasActive,
  onStart,
  onPickDay,
  onSkip,
  busy,
}: {
  next: NextWorkoutDto;
  unit: WeightUnit;
  lookup: ExerciseLookup;
  doneToday: boolean;
  hasActive: boolean;
  onStart: () => void;
  onPickDay: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const exercises = [...next.exercises].sort((a, b) => a.position - b.position);
  return (
    <GymCard data-testid="gym-next-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardLabel>{doneToday ? 'Done today ✓ · Next time' : 'Next up'}</CardLabel>
          <h2 className="mt-1 truncate font-serif text-xl font-bold text-gray-900">
            {next.dayName}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
            <span>{exercises.length} exercises</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />~{next.estimatedMin} min
            </span>
            {next.isDeload && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                Deload week
              </span>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y">
        {exercises.map((ex, index) => {
          const meta = lookup(ex.exerciseId);
          const slot = supersetSlot(exercises, index);
          return (
            <li key={ex.routineExerciseId}>
              <SupersetHeading exercises={exercises} index={index} />
              <div
                className={cn(
                  'flex items-center justify-between gap-3 py-2',
                  slot && 'border-l-4 border-l-violet-500 pl-2',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {slot && (
                    <span
                      className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-800"
                      data-testid="gym-next-up-superset-chip"
                    >
                      {slot.label}
                      {slot.position + 1}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-sm text-gray-800">
                    {meta?.name ?? 'Exercise'}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500">
                  {prescriptionText(ex.suggestion, unit, meta?.loadType, meta?.isTimed)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        size="lg"
        onClick={onStart}
        className="mt-4 w-full bg-[#944a00] hover:bg-[#7a3d00]"
        data-testid="gym-start-workout"
      >
        <Play aria-hidden="true" />
        {hasActive ? 'Resume workout' : 'Start workout'}
      </Button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onPickDay} disabled={busy || hasActive}>
          <CalendarClock aria-hidden="true" />
          <span className="truncate">Another day</span>
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={busy || hasActive}>
          <SkipForward aria-hidden="true" />
          <span className="truncate">Skip this day</span>
        </Button>
      </div>
    </GymCard>
  );
}

function OfferCard({ offer }: { offer: GymOffer }) {
  const utils = trpc.useUtils();
  const done = () => void utils.gym.bootstrap.invalidate();
  const dismiss = trpc.gym.progression.dismissOffer.useMutation({ onSuccess: done });
  const deload = trpc.gym.progression.startDeload.useMutation({ onSuccess: done });
  const busy = dismiss.isPending || deload.isPending;

  return (
    <GymCard
      className={cn(offer.kind === 'comeback' ? 'border-emerald-200 bg-emerald-50/50' : '')}
      data-testid={`gym-offer-${offer.kind}`}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{offer.title}</p>
          <p className="mt-1 text-sm text-gray-600">{offer.body}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {offer.kind === 'recap' && (
          <Button asChild variant="outline" size="sm">
            <Link href="/gym/stats">See your month</Link>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => dismiss.mutate({ kind: offer.kind, key: offer.key })}
        >
          {offer.kind === 'deload' ? 'Not now' : 'Dismiss'}
        </Button>
        {offer.kind === 'deload' && (
          <Button size="sm" disabled={busy} onClick={() => deload.mutate()}>
            Start deload week
          </Button>
        )}
      </div>
    </GymCard>
  );
}
