'use client';

import Link from 'next/link';
import { useState } from 'react';
import { WorkoutReceipt } from '@/features/progress/workout-progress';
import { Check, Flame, Info } from 'lucide-react';
import type { GymBootstrap, WorkoutSessionDoc, WorkoutType } from '@chefer/types';
import { Button, pressControl, ProgressRing, Sheet } from '@chefer/ui';
import {
  cn,
  estimateSessionKcal,
  streakWeeksLabel,
  toSessionSummary,
  workoutMinutes,
  workoutTypeLabel,
  type ExerciseLookup,
} from '@chefer/utils';
import { CardLabel, GymCard } from '../shared/gym-card';
import { SyncIndicator } from '../shared/sync-indicator';
import { tickedExercises } from './simple-helpers';

// ─── "Keep it simple" summary (simple training mode §6.6 / §6.7) ─────────────
// A finished typed workout: "Nice work", the type and minutes, an honest
// "~kcal (est.)" with "How we estimate this", the week ring and streak, and
// the exercises ticked off. No PRs, volume, e1RM or progression.

export function SimpleSummary({
  doc,
  workoutType,
  data,
  lookup,
}: {
  doc: WorkoutSessionDoc;
  workoutType: WorkoutType;
  data: GymBootstrap;
  lookup: ExerciseLookup;
}) {
  const [howOpen, setHowOpen] = useState(false);
  const summary = toSessionSummary(doc);
  const typeLabel = workoutTypeLabel(workoutType);
  const minutes = Math.max(1, workoutMinutes(summary));
  const burn = estimateSessionKcal({ session: summary, bodyweightKg: data.bodyweightKg });
  const ticked = tickedExercises(doc);
  const { thisWeekSessions: done, thisWeekGoal: goal } = data.streak;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8" data-testid="gym-simple-summary">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Workout done
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Nice work</h1>
      </div>

      <div className="flex flex-col gap-4">
        <GymCard data-testid="gym-simple-summary-stats">
          <p className="text-lg font-semibold text-gray-900">
            {doc.name === typeLabel ? typeLabel : `${doc.name} · ${typeLabel}`} · {minutes} min
          </p>
          {burn ? (
            <div className="mt-1 flex items-center gap-1">
              <p className="text-sm text-gray-700" data-testid="gym-simple-summary-kcal">
                {burn.isEstimate
                  ? `~${burn.kcal} kcal (est.)`
                  : `${burn.kcal} kcal (from your watch)`}
              </p>
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                aria-label="How we estimate this"
                data-testid="gym-simple-summary-how"
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100',
                  pressControl,
                )}
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            data.bodyweightKg === null && (
              <p className="mt-1 text-sm text-gray-500">Log your weight to see calories.</p>
            )
          )}
        </GymCard>

        <GymCard className="flex items-center gap-4">
          <ProgressRing
            progress={goal > 0 ? done / goal : 0}
            label={`${done} of ${goal} workouts this week`}
            color={goal > 0 && done >= goal ? '#059669' : '#944a00'}
          >
            <span className="text-sm font-bold text-gray-800">
              {done}/{goal}
            </span>
          </ProgressRing>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-gray-900">
              {done} of {goal} this week
            </p>
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Flame className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
              {streakWeeksLabel(data.streak.current)}
            </p>
          </div>
        </GymCard>

        {ticked.length > 0 && (
          <GymCard>
            <CardLabel>Exercises</CardLabel>
            <ul className="mt-2 space-y-1.5" data-testid="gym-simple-summary-exercises">
              {ticked.map((se) => (
                <li key={se.id} className="flex items-center gap-2 text-sm text-gray-800">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    {lookup(se.exerciseId)?.name ?? 'Exercise'}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">done</span>
                </li>
              ))}
            </ul>
          </GymCard>
        )}

        {/* Kitchen progress: what this workout earned (nothing until synced, or when off). */}
        <WorkoutReceipt doc={doc} />

        <SyncIndicator />
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

      <Sheet
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title="How we estimate this"
        size="sm"
      >
        <p className="px-5 pb-5 text-sm text-gray-700">
          We multiply a typical effort for {typeLabel.toLowerCase()} by your body weight and the
          workout&apos;s time. Your watch&apos;s number wins when you enter one. It never changes
          your food targets.
        </p>
      </Sheet>
    </div>
  );
}
