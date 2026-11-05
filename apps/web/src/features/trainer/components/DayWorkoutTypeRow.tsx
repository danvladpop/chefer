'use client';

import { weekdayNameT } from '@/features/coaching/lib/dates';
import type { DraftDay } from '@/features/gym/routine/draft';
import { useT } from '@/lib/i18n';
import { createTranslator, type Translator } from '@chefer/i18n';
import { Button } from '@chefer/ui';
import { workoutTypeLabel } from '@chefer/utils';

// ─── A routine day's workout type, as the trainer sees it (PRD 2026-10 §4.3) ──
// A "Keep it simple" client plans their week as workout types (My week, ADR
// 0001): a type-only day ("Tue · Yoga") has no exercises. The trainer sees the
// type and can set, change or remove it; the picker is My week's sheet.

const EN = createTranslator('en').t;

/** "Tue · Yoga" (just "Yoga" when the day has no weekday). */
export function dayTypeLine(
  day: Pick<DraftDay, 'plannedWeekday' | 'workoutType'>,
  t: Translator['t'] = EN,
): string | null {
  if (!day.workoutType) return null;
  const weekday = day.plannedWeekday !== null ? weekdayNameT(day.plannedWeekday, t) : undefined;
  // `workoutTypeLabel` (@chefer/utils) is still English: the workout types are not in a catalog yet.
  return [weekday, workoutTypeLabel(day.workoutType)].filter(Boolean).join(' · ');
}

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
  const { t } = useT();
  const line = dayTypeLine(day, t);
  if (!line) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 w-full"
        onClick={onEdit}
        aria-label={t('coaching.trainer.profile.workoutType.setFor', { day: day.name })}
      >
        {t('coaching.trainer.profile.workoutType.set')}
      </Button>
    );
  }
  const typeOnly =
    day.workoutType && day.exercises.length === 0
      ? t('coaching.trainer.profile.workoutType.typeOnly', {
          type: workoutTypeLabel(day.workoutType),
          client: clientName,
        })
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
          aria-label={t('coaching.trainer.profile.workoutType.changeFor', { day: day.name })}
        >
          {t('coaching.trainer.profile.workoutType.change')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={onClear}
          aria-label={t('coaching.trainer.profile.workoutType.removeFor', { day: day.name })}
        >
          {t('coaching.trainer.profile.workoutType.remove')}
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
