'use client';

import type { DraftDay } from '@/features/gym/routine/draft';
import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { WEEKDAY_SHORT, workoutTypeLabel } from '@chefer/utils';

// ─── A routine day's workout type, as the trainer sees it (PRD 2026-10 §4.3) ──
// A "Keep it simple" client plans their week as workout types (My week, ADR
// 0001): a type-only day ("Tue · Yoga") has no exercises. The trainer sees the
// type and can set, change or remove it; the picker is My week's sheet.

/** "Tue · Yoga" (just "Yoga" when the day has no weekday). */
export function dayTypeLine(day: Pick<DraftDay, 'plannedWeekday' | 'workoutType'>): string | null {
  if (!day.workoutType) return null;
  const weekday = day.plannedWeekday !== null ? WEEKDAY_SHORT[day.plannedWeekday] : undefined;
  return [weekday, workoutTypeLabel(day.workoutType)].filter(Boolean).join(' · ');
}

const copy = COACHING_COPY.trainerProfile.workoutType;

export function DayWorkoutTypeRow({
  day,
  clientName,
  onEdit,
  onClear,
}: {
  day: DraftDay;
  /** The client's first name, for the type-only day's hint. */
  clientName: string;
  /** Opens the workout type picker for this day. */
  onEdit: () => void;
  onClear: () => void;
}) {
  const line = dayTypeLine(day);
  if (!line) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 w-full"
        onClick={onEdit}
        aria-label={`${copy.set}: ${day.name}`}
      >
        {copy.set}
      </Button>
    );
  }
  const typeOnly =
    day.workoutType && day.exercises.length === 0
      ? copy.typeOnly(workoutTypeLabel(day.workoutType), clientName)
      : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1">
        <p
          className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900"
          data-testid="trainer-day-type"
        >
          {line}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={onEdit}
          aria-label={`${copy.change} ${copy.label.toLowerCase()}: ${day.name}`}
        >
          {copy.change}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={onClear}
          aria-label={`${copy.remove}: ${day.name}`}
        >
          {copy.remove}
        </Button>
      </div>
      {typeOnly ? (
        <p className="text-xs text-muted-foreground" data-testid="trainer-day-type-only">
          {typeOnly}
        </p>
      ) : null}
    </div>
  );
}
