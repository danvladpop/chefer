'use client';

import type { ReactNode } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { cn, type ExerciseLookup } from '@chefer/utils';
import type { DraftExercise } from '../draft';

const RIR_OPTIONS = [0, 1, 2, 3, 4];

const numberInputCls =
  'h-11 w-full min-w-0 rounded-md border border-gray-200 px-2 text-center text-sm focus:border-gray-400 focus:outline-none lg:h-9';

export interface ExerciseFieldsFormProps {
  exercise: DraftExercise;
  lookup: ExerciseLookup;
  onChange: (
    patch: Partial<Pick<DraftExercise, 'sets' | 'repMin' | 'repMax' | 'targetRir' | 'restSec'>>,
  ) => void;
  onSwap: () => void;
  onRemove: () => void;
  /** Drag handle / reorder controls injected by the desktop or phone shell. */
  leading?: ReactNode;
  /** Place in a superset ("A", 0-based position), when in one. */
  superset?: { label: string; position: number } | null;
  /** Linked to the next exercise (the "Superset with next" toggle's state). */
  linkedToNext?: boolean;
  /** Omit for the last exercise of the day (nothing to link to). */
  onSupersetWithNext?: (linked: boolean) => void;
}

/** The editable fields for one routine-exercise slot (sets, rep range, rest, target RIR). */
export function ExerciseFieldsForm({
  exercise,
  lookup,
  onChange,
  onSwap,
  onRemove,
  leading,
  superset = null,
  linkedToNext = false,
  onSupersetWithNext,
}: ExerciseFieldsFormProps) {
  const meta = lookup(exercise.exerciseId);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3',
        superset && 'border-l-4 border-l-violet-500',
      )}
      data-testid="routine-exercise-row"
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        {superset && (
          <span
            className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-800"
            data-testid="routine-superset-chip"
          >
            {superset.label}
            {superset.position + 1}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
          {meta?.name ?? exercise.exerciseId}
        </p>
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap exercise"
          title="Swap exercise"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <Repeat className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove exercise"
          title="Remove exercise"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Sets</span>
          <input
            type="number"
            min={1}
            max={10}
            value={exercise.sets}
            onChange={(e) => onChange({ sets: clamp(Number(e.target.value), 1, 10) })}
            className={numberInputCls}
            data-testid="exercise-sets-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Reps min
          </span>
          <input
            type="number"
            min={1}
            max={3600}
            value={exercise.repMin}
            onChange={(e) => onChange({ repMin: clamp(Number(e.target.value), 1, 3600) })}
            className={numberInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Reps max
          </span>
          <input
            type="number"
            min={1}
            max={3600}
            value={exercise.repMax}
            onChange={(e) => onChange({ repMax: clamp(Number(e.target.value), 1, 3600) })}
            className={numberInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Rest (s)
          </span>
          <input
            type="number"
            min={15}
            max={900}
            step={5}
            value={exercise.restSec}
            onChange={(e) => onChange({ restSec: clamp(Number(e.target.value), 15, 900) })}
            className={numberInputCls}
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Target RIR
        </span>
        <select
          value={exercise.targetRir}
          onChange={(e) => onChange({ targetRir: Number(e.target.value) })}
          className="h-11 rounded-md border border-gray-200 px-2 text-sm focus:border-gray-400 focus:outline-none lg:h-9"
        >
          {RIR_OPTIONS.map((rir) => (
            <option key={rir} value={rir}>
              {rir}
              {rir === 3 ? '+' : ''}
            </option>
          ))}
        </select>
      </label>

      {onSupersetWithNext && (
        <button
          type="button"
          role="switch"
          aria-checked={linkedToNext}
          onClick={() => onSupersetWithNext(!linkedToNext)}
          data-testid="superset-with-next"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-gray-50 px-2 text-left hover:bg-gray-100"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-gray-700">Superset with next</span>
            <span className="block text-xs text-gray-500">
              No rest in between; rest after the round
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
              linkedToNext ? 'justify-end bg-violet-600' : 'justify-start bg-gray-300',
            )}
          >
            <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
          </span>
        </button>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
