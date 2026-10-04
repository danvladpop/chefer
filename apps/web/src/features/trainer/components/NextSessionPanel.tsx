import { formatShortDay, weekdayName } from '@/features/coaching/lib/dates';
import {
  COACHING_COPY,
  type ExerciseLoadType,
  type NextTargetDto,
  type TrainerRoutineDto,
  type TrainerRoutineExerciseDto,
  type WeightUnit,
} from '@chefer/types';
import { Badge, Button } from '@chefer/ui';
import type { ExerciseLookup } from '@chefer/utils';
import { targetText } from '../format';

// ─── Next session (spec §2.5, §6) ─────────────────────────────────────────────
// The next-time suggestion per strength exercise, and the trainer's (or the
// client's) pending target over it. "Adjust" sets one, "Reset" clears it.

export type NextTargetState = 'suggestion' | 'trainer' | 'client';

/** Which of the panel's states a row is in: the app's suggestion, set by the trainer, or by the client. */
export function nextTargetState(next: NextTargetDto): NextTargetState {
  if (!next.override) return 'suggestion';
  return next.override.setBy === 'TRAINER' ? 'trainer' : 'client';
}

export interface NextRowTarget {
  row: TrainerRoutineExerciseDto;
  next: NextTargetDto;
  name: string;
}

export function NextTargetText({
  next,
  unit,
  load,
  timed,
}: {
  next: NextTargetDto;
  unit: WeightUnit;
  load: { loadType: ExerciseLoadType; perHand: boolean };
  timed: boolean;
}) {
  const copy = COACHING_COPY.trainer;
  const state = nextTargetState(next);
  if (next.override && state !== 'suggestion') {
    const value = targetText(next.override.weightKg, next.override.reps, unit, load, timed);
    const at = formatShortDay(next.override.at);
    return <>{state === 'trainer' ? copy.setByYou(value, at) : copy.setByClient(value, at)}</>;
  }
  const value = targetText(next.suggestion.weightKg, next.suggestion.reps, unit, load, timed);
  return <>{copy.appSuggestion(value)}</>;
}

export function NextSessionPanel({
  routine,
  clientName,
  unit,
  lookup,
  onAdjust,
  onReset,
  busy,
}: {
  routine: TrainerRoutineDto;
  clientName: string;
  unit: WeightUnit;
  lookup: ExerciseLookup;
  onAdjust: (target: NextRowTarget) => void;
  onReset: (target: NextRowTarget) => void;
  busy: boolean;
}) {
  const copy = COACHING_COPY.trainer;
  const days = routine.days.slice().sort((a, b) => a.position - b.position);
  const nextDay = days.find((d) => d.id === routine.nextDayId) ?? null;
  // The next day first, then the rest in routine order.
  const ordered = nextDay ? [nextDay, ...days.filter((d) => d.id !== nextDay.id)] : days;

  return (
    <section
      aria-labelledby="next-session-title"
      className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="trainer-next-session"
    >
      <h2 id="next-session-title" className="font-semibold text-gray-900">
        {copy.nextSession}
      </h2>
      {nextDay && (
        <p className="text-sm font-medium text-gray-700" data-testid="trainer-next-day">
          {copy.nextDay(
            nextDay.name,
            nextDay.plannedWeekday !== null ? weekdayName(nextDay.plannedWeekday) : null,
          )}
        </p>
      )}
      {ordered.map((day) => {
        const rows = day.exercises.filter((e) => e.next !== null);
        if (rows.length === 0) return null;
        return (
          <details key={day.id} open={day.id === nextDay?.id || nextDay === null} className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-gray-900">
              <span className="min-w-0 break-words">{day.name}</span>
              {day.id === nextDay?.id && <Badge variant="info">Next up</Badge>}
            </summary>
            <ul className="flex flex-col divide-y divide-gray-100">
              {rows.map((row) => {
                const meta = lookup(row.exerciseId);
                const next = row.next;
                if (!next) return null;
                const name = meta?.name ?? row.exerciseId;
                const target: NextRowTarget = { row, next, name };
                return (
                  <li
                    key={row.id}
                    className="flex min-w-0 flex-col gap-1 py-2"
                    data-testid="trainer-next-row"
                  >
                    <p className="min-w-0 break-words text-sm font-medium text-gray-900">{name}</p>
                    <p
                      className="min-w-0 break-words text-sm text-gray-600"
                      data-state={nextTargetState(next)}
                    >
                      <NextTargetText
                        next={next}
                        unit={unit}
                        load={{
                          loadType: meta?.loadType ?? 'WEIGHTED',
                          perHand: meta?.perHand ?? false,
                        }}
                        timed={meta?.isTimed ?? false}
                      />
                    </p>
                    {next.lastDoneDate && !next.override && (
                      <p className="text-xs text-gray-500">
                        {copy.lastDone(formatShortDay(next.lastDoneDate))}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      {copy.appliesTo(clientName, name, next.repBucket.replace('-', '–'))}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        aria-label={`${copy.adjust}: ${name}`}
                        onClick={() => onAdjust(target)}
                      >
                        {copy.adjust}
                      </Button>
                      {next.override && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          aria-label={`${copy.resetToSuggestion}: ${name}`}
                          onClick={() => onReset(target)}
                        >
                          {copy.resetToSuggestion}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </section>
  );
}
