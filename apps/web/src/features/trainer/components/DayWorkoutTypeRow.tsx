'use client';

import type { DraftDay } from '@/features/gym/routine/draft';
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

export function DayWorkoutTypeRow({
  day,
  onEdit,
  onClear,
}: {
  day: DraftDay;
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
        aria-label={`Set workout type: ${day.name}`}
      >
        Set workout type
      </Button>
    );
  }
  return (
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
        aria-label={`Change workout type: ${day.name}`}
      >
        Change
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 shrink-0"
        onClick={onClear}
        aria-label={`Remove workout type: ${day.name}`}
      >
        Remove
      </Button>
    </div>
  );
}
