'use client';

import { Dumbbell, Footprints, Info } from 'lucide-react';
import type { DayKind, PlanTrainingDay } from '@chefer/types';
import { cn, preRunNote, trainingDayHeaderCopy, trainingGlyph } from '@chefer/utils';

// ─── Training days on the plan (UX-06, T-06.8) ─────────────────────────────────
// A glyph for the day chips / column headers, the header button above a
// training day's meals (opens the explain dialog) and the evening-before note
// for a long run. Copy comes from @chefer/utils so it matches mobile.

/** Barbell for lifting, footprints for runs (`trainingGlyph`'s web mapping). */
export function TrainingGlyph({ kind, className }: { kind: DayKind; className?: string }) {
  const Icon = trainingGlyph(kind) === 'walk-outline' ? Footprints : Dumbbell;
  return (
    <Icon
      aria-hidden="true"
      data-testid="training-glyph"
      className={cn('h-3 w-3 shrink-0', className)}
    />
  );
}

export function TrainingDayHeader({
  day,
  isToday,
  onOpen,
  className,
}: {
  day: PlanTrainingDay;
  isToday: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const copy = trainingDayHeaderCopy(day, { isToday });
  return (
    <button
      type="button"
      data-testid="training-day-header"
      onClick={onOpen}
      aria-label={copy.a11yLabel}
      className={cn(
        'flex min-h-11 w-full items-start gap-2 rounded-xl bg-[#fff3e8] px-3 py-2 text-left text-[#944a00] hover:bg-[#ffebd6]',
        className,
      )}
    >
      <TrainingGlyph kind={day.kind} className="mt-0.5 h-3.5 w-3.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{copy.title}</span>
        {copy.targetLine && <span className="block text-xs">{copy.targetLine}</span>}
        {copy.bonusLine && <span className="block text-xs opacity-80">{copy.bonusLine}</span>}
      </span>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** The day before a long run: the carb-snack suggestion. Null on every other day. */
export function preRunNoteFor(
  trainingDays: readonly PlanTrainingDay[] | undefined,
  dayOfWeek: number,
): string | null {
  const tomorrow = trainingDays?.find(
    (d) => d.dayOfWeek === dayOfWeek + 1 && d.kind === 'long_run',
  );
  return tomorrow ? preRunNote(tomorrow.preRunSnack) : null;
}

export function PreRunNote({ note, className }: { note: string; className?: string }) {
  return (
    <p
      data-testid="pre-run-note"
      className={cn('rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-700', className)}
    >
      {note}
    </p>
  );
}
