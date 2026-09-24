'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Clock, Flame, ListChecks, SlidersHorizontal, Trophy } from 'lucide-react';
import type {
  EquipmentProfile,
  ExerciseMeta,
  PrKind,
  ProgressionDto,
  SessionExerciseDoc,
  WeightUnit,
  WorkoutSessionDoc,
} from '@chefer/types';
import { Button } from '@chefer/ui';
import { cn, explain, formatLoad, isHarder, repBucket, stepDown, stepUp } from '@chefer/utils';
import { KIND_ARROW, KIND_TONE, prescriptionText, repsText } from '../shared/format';
import { CardLabel, GymCard, GymSkeleton } from '../shared/gym-card';
import { Stepper } from '../shared/stepper';
import { SyncIndicator } from '../shared/sync-indicator';
import { FALLBACK_PROFILE, useGymData } from '../shared/use-gym-data';
import { WeekRing } from '../shared/week-ring';
import { useOutboxState } from './outbox';
import { getGymOwner, subscribeGymOwner } from './owner';
import { readLastFinished } from './use-active-workout';
import { livePrs, loadSlotOf, sessionProgress, sortedExercises } from './workout-model';

// ─── Workout summary (gym_plan.md §1.3 Finish) ────────────────────────────────
// Duration, sets, PRs, the week ring and streak, and "Next time": the engine's
// decision per exercise with its reason, each with an Adjust stepper (the
// target-level edit, gym.progression.setOverride).

const PR_LABEL: Record<PrKind, string> = { e1rm: 'e1RM', weight: 'Weight', reps: 'Reps' };
const serverOwner = () => null;

export function SummaryView({ id }: { id: string }) {
  const { data, lookup, profile, unit, ready, hasMounted } = useGymData();
  const outboxState = useOutboxState();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner, serverOwner);

  const localDoc = useMemo<WorkoutSessionDoc | null>(() => {
    if (!hasMounted) return null;
    const queued = outboxState.entries.find((e) => e.doc.id === id)?.doc;
    return queued ?? readLastFinished(id, owner);
  }, [hasMounted, outboxState, id, owner]);

  const remote = trpc.gym.session.get.useQuery(
    { id },
    { enabled: hasMounted && localDoc === null, retry: false, staleTime: Infinity },
  );
  const doc = localDoc ?? remote.data ?? null;

  if (!hasMounted || (!doc && remote.isLoading) || !ready || !data) {
    if (hasMounted && remote.isError && !doc) return <NotFound />;
    return (
      <Frame>
        <GymSkeleton rows={3} />
      </Frame>
    );
  }
  if (!doc) return <NotFound />;

  const exercises = sortedExercises(doc).filter((se) => !se.skipped);
  const progress = sessionProgress(doc);
  const minutes = Math.max(
    1,
    Math.round(
      (Date.parse(doc.finishedAt ?? doc.clientUpdatedAt) - Date.parse(doc.startedAt)) / 60000,
    ),
  );
  const prior = data.recentSessions.filter((s) => s.id !== doc.id && s.startedAt < doc.startedAt);
  const prs = livePrs(doc, prior);
  const inventory = profile ?? FALLBACK_PROFILE;

  return (
    <Frame>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {doc.status === 'COMPLETED' ? 'Workout done' : 'Workout'}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">{doc.name}</h1>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <GymCard data-testid="gym-summary-stats">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={Clock} label="Minutes" value={String(minutes)} />
              <Stat icon={ListChecks} label="Sets" value={String(progress.done)} />
              <Stat icon={Trophy} label="PRs" value={String(prs.size)} />
            </dl>
          </GymCard>

          <GymCard className="flex items-center gap-4">
            <WeekRing done={data.streak.thisWeekSessions} goal={data.streak.thisWeekGoal} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-gray-900">
                {data.streak.thisWeekSessions} of {data.streak.thisWeekGoal} this week
              </p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Flame className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
                {data.streak.current}-week streak
              </p>
            </div>
          </GymCard>

          {prs.size > 0 && (
            <GymCard>
              <CardLabel>Personal records</CardLabel>
              <ul className="mt-2 space-y-1.5">
                {[...prs.entries()].map(([seId, pr]) => {
                  const se = doc.exercises.find((e) => e.id === seId);
                  const set = se?.sets.find((s) => s.id === pr.setId);
                  const meta = se ? lookup(se.exerciseId) : undefined;
                  return (
                    <li key={seId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                        <span className="truncate">{meta?.name ?? 'Exercise'}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {PR_LABEL[pr.kind]} ·{' '}
                        {set
                          ? `${formatLoad(set.weightKg, unit, meta?.loadType)} × ${set.reps}`
                          : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </GymCard>
          )}

          <SyncIndicator />
        </div>

        <GymCard data-testid="gym-next-time">
          <CardLabel>Next time</CardLabel>
          <ul className="mt-3 divide-y">
            {exercises.map((se) => (
              <NextTimeRow
                key={se.id}
                se={se}
                meta={lookup(se.exerciseId)}
                progression={
                  data.progressions.find(
                    (p) =>
                      p.exerciseId === se.exerciseId &&
                      p.repBucket === repBucket(se.repMin, se.repMax),
                  ) ?? null
                }
                profile={inventory}
                unit={unit}
              />
            ))}
            {exercises.length === 0 && (
              <li className="py-3 text-sm text-gray-500">No exercises were logged.</li>
            )}
          </ul>
        </GymCard>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          asChild
          size="lg"
          className="w-full bg-[#944a00] hover:bg-[#7a3d00] sm:w-auto"
          data-testid="gym-summary-done"
        >
          <Link href="/gym">Done</Link>
        </Button>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">{children}</div>;
}

function NotFound() {
  return (
    <Frame>
      <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
        <p className="text-sm text-gray-600">We couldn&apos;t find that workout.</p>
        <Button asChild className="mt-4">
          <Link href="/gym">Back to Today</Link>
        </Button>
      </div>
    </Frame>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-gray-500">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function NextTimeRow({
  se,
  meta,
  progression,
  profile,
  unit,
}: {
  se: SessionExerciseDoc;
  meta: ExerciseMeta | undefined;
  progression: ProgressionDto | null;
  profile: EquipmentProfile;
  unit: WeightUnit;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const suggestion = progression?.suggestion ?? null;
  const [weightKg, setWeightKg] = useState(suggestion?.weightKg ?? 0);
  const [repsDelta, setRepsDelta] = useState(0);
  const save = trpc.gym.progression.setOverride.useMutation({
    onSuccess: () => {
      setEditing(false);
      void utils.gym.bootstrap.invalidate();
    },
  });

  const name = meta?.name ?? 'Exercise';
  if (!suggestion) {
    return (
      <li className="py-3">
        <p className="truncate text-sm font-medium text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">Next target appears once this workout syncs.</p>
      </li>
    );
  }

  const slot = meta ? loadSlotOf(meta) : null;
  const hasLoad = meta?.loadType !== 'BODYWEIGHT';
  const reps = suggestion.reps.map((r) => Math.max(1, r + repsDelta));
  const timed = meta?.isTimed ?? false;

  return (
    <li className="py-3" data-testid="gym-next-time-row">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            KIND_TONE[suggestion.kind],
          )}
          aria-hidden="true"
        >
          {KIND_ARROW[suggestion.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{name}</p>
            <p className="shrink-0 text-xs font-medium tabular-nums text-gray-700">
              {prescriptionText(suggestion, unit, meta?.loadType, timed)}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{explain(suggestion, unit)}</p>
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setWeightKg(suggestion.weightKg);
                setRepsDelta(0);
                setEditing(true);
              }}
              className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[#944a00] hover:bg-[#fff3e8]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Adjust
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-xl border bg-gray-50 p-3 sm:ml-10">
          <div className="grid gap-2 sm:grid-cols-2">
            {hasLoad && slot && (
              <Stepper
                label="next weight"
                value={formatLoad(weightKg, unit, meta?.loadType)}
                onDecrement={() => setWeightKg((w) => stepDown(w, slot, profile))}
                onIncrement={() => setWeightKg((w) => stepUp(w, slot, profile))}
              />
            )}
            <Stepper
              label="next reps"
              value={`${repsText(reps, timed)}${timed ? '' : ' reps'}`}
              onDecrement={() => setRepsDelta((d) => d - 1)}
              onIncrement={() => setRepsDelta((d) => d + 1)}
              canDecrement={reps.some((r) => r > 1)}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => {
                if (!progression) return;
                const direction =
                  slot && isHarder(weightKg, suggestion.weightKg, slot)
                    ? 'up'
                    : slot && isHarder(suggestion.weightKg, weightKg, slot)
                      ? 'down'
                      : repsDelta > 0
                        ? 'up'
                        : repsDelta < 0
                          ? 'down'
                          : 'same';
                capture('suggestion_overridden', {
                  reasonCode: suggestion.reasonCode,
                  direction,
                });
                save.mutate({
                  exerciseId: se.exerciseId,
                  repBucket: progression.repBucket,
                  weightKg,
                  reps,
                });
              }}
            >
              Save target
            </Button>
          </div>
          {save.isError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              Couldn&apos;t save. Adjusting targets needs a connection.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
