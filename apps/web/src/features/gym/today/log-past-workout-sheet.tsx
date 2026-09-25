'use client';

import { useState } from 'react';
import type { GymBootstrap } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  addDaysLocal,
  buildNextWorkout,
  cn,
  equipmentProfileOf,
  progressionKey,
  weekStartOf,
  type ProgressionEntry,
} from '@chefer/utils';
import { libraryLookup } from '../use-gym-bootstrap';

// "Log a past workout" (gym_plan.md §1.4 "Repair", research §4.2 #5): pick a
// date in the current or previous week — never the future — then a routine
// day or freestyle. Mirrors apps/mobile/src/features/gym/today/log-past-workout.tsx.

/** Every date from the Monday of the PREVIOUS week through yesterday, newest first. */
function eligibleBackfillDates(today: string): string[] {
  const start = weekStartOf(addDaysLocal(today, -7));
  const dates: string[] = [];
  for (let d = start; d < today; d = addDaysLocal(d, 1)) dates.push(d);
  return dates.reverse();
}

function formatDateLabel(date: string, today: string): string {
  if (date === addDaysLocal(today, -1)) return 'Yesterday';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function LogPastWorkoutSheet({
  open,
  onClose,
  data,
  today,
  onStartFreestyle,
  onStartDay,
}: {
  open: boolean;
  onClose: () => void;
  data: GymBootstrap;
  today: string;
  onStartFreestyle: (backfillDate: string) => void;
  onStartDay: (dayId: string, backfillDate: string) => void;
}) {
  const [date, setDate] = useState<string | null>(null);

  const close = () => {
    onClose();
    setDate(null);
  };

  const dates = eligibleBackfillDates(today);
  const sortedDays = [...(data.activeRoutine?.days ?? [])].sort((a, b) => a.position - b.position);

  if (!date) {
    return (
      <Sheet open={open} onClose={close} title="Which day?" size="sm">
        <ul className="space-y-1 px-5 pb-5" data-testid="gym-backfill-date-picker">
          {dates.length === 0 ? (
            <p className="py-3 text-sm text-gray-500">
              No eligible days yet — check back after your first week.
            </p>
          ) : (
            dates.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  data-testid={`gym-backfill-date-${d}`}
                  onClick={() => setDate(d)}
                  className="flex min-h-11 w-full items-center rounded-xl border px-4 py-2 text-left text-sm font-medium text-gray-900 hover:border-[#944a00]/40 hover:bg-gray-50"
                >
                  {formatDateLabel(d, today)}
                </button>
              </li>
            ))
          )}
        </ul>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title="Which routine day?" size="sm">
      <ul className="space-y-1 px-5 pb-5" data-testid="gym-backfill-day-picker">
        {sortedDays.map((day) => (
          <li key={day.id}>
            <button
              type="button"
              data-testid={`gym-backfill-day-${day.id}`}
              onClick={() => onStartDay(day.id, date)}
              className="flex min-h-11 w-full items-center rounded-xl border px-4 py-2 text-left text-sm font-medium text-gray-900 hover:border-[#944a00]/40 hover:bg-gray-50"
            >
              {day.name}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            data-testid="gym-backfill-freestyle"
            onClick={() => onStartFreestyle(date)}
            className={cn(
              'flex min-h-11 w-full items-center rounded-xl border px-4 py-2 text-left text-sm font-medium',
              'text-[#944a00] hover:bg-[#fff8f0]',
            )}
          >
            Freestyle
          </button>
        </li>
      </ul>
    </Sheet>
  );
}

/** Builds the NextWorkoutDto for a picked routine day, as of the picked date (web/mobile share this shape). */
export function buildBackfillWorkout(data: GymBootstrap, dayId: string, backfillDate: string) {
  if (!data.activeRoutine || !data.profile) return null;
  const progressions = new Map<string, ProgressionEntry>(
    data.progressions.map((p) => [
      progressionKey(p.exerciseId, p.repBucket),
      { state: p.state, override: p.override },
    ]),
  );
  return buildNextWorkout({
    routine: data.activeRoutine,
    dayId,
    lookup: libraryLookup(data),
    progressions,
    profile: equipmentProfileOf(data.profile),
    facts: { experience: data.profile.experience, ageYears: null },
    today: backfillDate,
    recentSessions: data.recentSessions,
    isDeload: false,
  });
}
