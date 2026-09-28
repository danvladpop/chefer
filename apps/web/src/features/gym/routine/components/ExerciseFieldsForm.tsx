'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Repeat, Trash2 } from 'lucide-react';
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
  /**
   * UX-05 A4 (T-05.3) phone parity: compact one-line summary that expands
   * (one at a time — the caller owns `expanded`/`onToggleExpand`), a
   * two-column labelled grid and RIR/superset under "More". Desktop
   * (DesktopEditorBoard) never passes this — its dense always-open grid is
   * unchanged.
   */
  compact?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/** "{n} sets · {min}–{max} reps · {rest} s rest" (mirrors the mobile day-editor). */
function summaryOf(exercise: DraftExercise): string {
  const range =
    exercise.repMin === exercise.repMax
      ? `${exercise.repMin}`
      : `${exercise.repMin}–${exercise.repMax}`;
  return `${exercise.sets} sets · ${range} reps · ${exercise.restSec} s rest`;
}

/** The editable fields for one routine-exercise slot (sets, rep range, rest, target RIR). */
export function ExerciseFieldsForm(props: ExerciseFieldsFormProps) {
  if (props.compact) return <CompactExerciseFieldsForm {...props} />;
  return <FullExerciseFieldsForm {...props} />;
}

/** UX-05 A4 compact/expanded card — phone widths only (AC23-26). */
function CompactExerciseFieldsForm({
  exercise,
  lookup,
  onChange,
  onSwap,
  onRemove,
  leading,
  superset = null,
  linkedToNext = false,
  onSupersetWithNext,
  expanded = false,
  onToggleExpand,
}: ExerciseFieldsFormProps) {
  const meta = lookup(exercise.exerciseId);
  const name = meta?.name ?? exercise.exerciseId;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col rounded-2xl bg-white',
        expanded ? 'gap-4 border border-gray-200 p-4 shadow-sm' : 'gap-1 px-4 py-3',
        superset && 'border-l-4 border-l-violet-500',
      )}
      data-testid="routine-exercise-row"
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div className="flex min-w-0 items-start gap-1">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {superset && (
              <span
                className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-800"
                data-testid="routine-superset-chip"
              >
                {superset.label}
                {superset.position + 1}
              </span>
            )}
            {/* Never truncated (AC23): 2 lines is enough for every catalogue name. */}
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900">{name}</p>
          </div>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${summaryOf(exercise)}. ${expanded ? 'Hide' : 'Show'} settings.`}
            className="-ml-1 flex min-h-11 w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-left hover:bg-gray-50"
          >
            <span
              className="min-w-0 flex-1 truncate text-sm text-gray-500"
              data-testid="routine-exercise-summary"
            >
              {summaryOf(exercise)}
            </span>
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Sets">
              <input
                type="number"
                min={1}
                max={10}
                value={exercise.sets}
                onChange={(e) => onChange({ sets: clamp(Number(e.target.value), 1, 10) })}
                className={numberInputCls}
                data-testid="exercise-sets-input"
              />
            </LabeledField>
            <LabeledField label="Rest between sets">
              <input
                type="number"
                min={15}
                max={900}
                step={5}
                value={exercise.restSec}
                onChange={(e) => onChange({ restSec: clamp(Number(e.target.value), 15, 900) })}
                className={numberInputCls}
              />
            </LabeledField>
            <LabeledField label="Reps from">
              <input
                type="number"
                min={1}
                max={3600}
                value={exercise.repMin}
                onChange={(e) => onChange({ repMin: clamp(Number(e.target.value), 1, 3600) })}
                className={numberInputCls}
              />
            </LabeledField>
            <LabeledField label="to">
              <input
                type="number"
                min={1}
                max={3600}
                value={exercise.repMax}
                onChange={(e) => onChange({ repMax: clamp(Number(e.target.value), 1, 3600) })}
                className={numberInputCls}
              />
            </LabeledField>
          </div>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-[#944a00]"
            data-testid="routine-exercise-more"
          >
            More
            {moreOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          {moreOpen && (
            <div className="flex flex-col gap-3">
              <LabeledField label="Target effort (RIR)">
                <select
                  value={exercise.targetRir}
                  onChange={(e) => onChange({ targetRir: Number(e.target.value) })}
                  className="h-11 rounded-md border border-gray-200 px-2 text-sm focus:border-gray-400 focus:outline-none"
                >
                  {RIR_OPTIONS.map((rir) => (
                    <option key={rir} value={rir}>
                      {rir}
                      {rir === 3 ? '+' : ''}
                    </option>
                  ))}
                </select>
              </LabeledField>
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
                    <span className="block text-xs font-medium text-gray-700">
                      Superset with next
                    </span>
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
          )}

          {/* One filled control area (the steppers above); Swap/Remove are text buttons. */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onSwap}
              className="flex min-h-11 items-center text-sm font-medium text-[#944a00]"
            >
              Swap exercise
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${name}`}
              className="flex min-h-11 items-center text-sm font-medium text-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

/** Unchanged dense always-open grid — DesktopEditorBoard never passes `compact`. */
function FullExerciseFieldsForm({
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
