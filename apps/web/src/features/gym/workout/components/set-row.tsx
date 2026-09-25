'use client';

import { memo } from 'react';
import { Check, MoreHorizontal, Trophy } from 'lucide-react';
import type {
  EquipmentProfile,
  ExerciseMeta,
  PrKind,
  SessionSetDoc,
  WeightUnit,
} from '@chefer/types';
import { cn, formatLoad, formatLoadNumber, stepDown, stepUp } from '@chefer/utils';
import { Stepper } from '../../shared/stepper';
import { loadSlotOf } from '../workout-model';

const PR_LABEL: Record<PrKind, string> = { e1rm: 'e1RM PR', weight: 'Weight PR', reps: 'Rep PR' };

export interface SetRowProps {
  seId: string;
  set: SessionSetDoc;
  /** Working-set number (1-based) or "W" for warm-ups. */
  label: string;
  meta: ExerciseMeta | undefined;
  profile: EquipmentProfile;
  unit: WeightUnit;
  lastTime: { weightKg: number; reps: number } | null;
  pr: PrKind | null;
  /** The set to do next (the workout's focus): outlined. */
  focused?: boolean;
  onEdit: (seId: string, setId: string, patch: { weightKg?: number; reps?: number }) => void;
  onToggle: (seId: string, set: SessionSetDoc) => void;
  onOpenPlates: (weightKg: number) => void;
  /** The per-row menu (remove this set). */
  onOpenMenu: (seId: string, setId: string) => void;
}

/**
 * `# | Last time | [− weight +] | [− reps +] | ✓` (gym_plan.md §1.3). Values
 * are the engine's prefilled targets; ✓ logs them in one click. Memoised so a
 * tick re-renders only its own row.
 */
export const SetRow = memo(function SetRow({
  seId,
  set,
  label,
  meta,
  profile,
  unit,
  lastTime,
  pr,
  focused = false,
  onEdit,
  onToggle,
  onOpenPlates,
  onOpenMenu,
}: SetRowProps) {
  const done = set.completedAt !== null;
  const loadType = meta?.loadType ?? 'WEIGHTED';
  const timed = meta?.isTimed ?? false;
  const slot = meta ? loadSlotOf(meta) : null;
  const hasLoad = loadType !== 'BODYWEIGHT';
  // Plate maths assumes the profile's bar, so only real barbells get the calculator.
  const barbell = meta?.equipment === 'BARBELL';
  const repStep = timed ? 5 : 1;

  const lastText = lastTime
    ? `${hasLoad ? `${formatLoadNumber(lastTime.weightKg, unit)} × ` : ''}${lastTime.reps}${timed ? ' s' : ''}`
    : '—';

  return (
    <div
      className={cn(
        'grid grid-cols-[2.75rem_minmax(0,1fr)_3rem] items-center gap-x-1.5 gap-y-1 rounded-xl border px-1 py-1.5',
        done
          ? 'border-transparent bg-emerald-50/70'
          : set.isWarmup
            ? 'border-transparent bg-gray-50'
            : 'bg-white',
        !done && (focused ? 'border-[#944a00]/40' : 'border-transparent'),
      )}
      data-testid="gym-set-row"
      data-done={done ? 'true' : 'false'}
      data-focused={focused ? 'true' : undefined}
    >
      {/* The set number doubles as the per-row menu (remove this set). */}
      <button
        type="button"
        onClick={() => onOpenMenu(seId, set.id)}
        aria-label={`Options for ${set.isWarmup ? 'warm-up set' : `set ${label}`}`}
        aria-haspopup="dialog"
        data-testid="gym-set-menu"
        className={cn(
          'flex min-h-11 w-11 flex-col items-center justify-center rounded-lg text-xs font-semibold tabular-nums hover:bg-gray-100',
          set.isWarmup ? 'text-gray-400' : 'text-gray-600',
        )}
      >
        {label}
        <MoreHorizontal className="h-3 w-3 text-gray-300" aria-hidden="true" />
      </button>

      {/* Weight over reps on phones; side by side once there is room. */}
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row">
        {hasLoad && slot ? (
          <Stepper
            label="weight"
            value={formatLoadNumber(set.weightKg, unit)}
            valueLabel={`${formatLoad(set.weightKg, unit, loadType)}${barbell ? ', open plate calculator' : ''}`}
            onDecrement={() =>
              onEdit(seId, set.id, { weightKg: stepDown(set.weightKg, slot, profile) })
            }
            onIncrement={() =>
              onEdit(seId, set.id, { weightKg: stepUp(set.weightKg, slot, profile) })
            }
            {...(barbell ? { onValueClick: () => onOpenPlates(set.weightKg) } : {})}
            className="sm:flex-1"
            testId="gym-weight-stepper"
          />
        ) : (
          <span className="flex min-h-11 items-center justify-center rounded-xl border bg-gray-50 text-sm font-semibold text-gray-600 sm:flex-1">
            BW
          </span>
        )}
        <Stepper
          label={timed ? 'seconds' : 'reps'}
          value={`${set.reps}${timed ? 's' : ''}`}
          valueLabel={`${set.reps} ${timed ? 'seconds' : 'reps'}`}
          onDecrement={() => onEdit(seId, set.id, { reps: Math.max(0, set.reps - repStep) })}
          onIncrement={() => onEdit(seId, set.id, { reps: Math.min(3600, set.reps + repStep) })}
          canDecrement={set.reps > 0}
          className="sm:flex-1"
          testId="gym-reps-stepper"
        />
      </div>

      <button
        type="button"
        onClick={() => onToggle(seId, set)}
        aria-pressed={done}
        aria-label={done ? `Undo set ${label}` : `Log set ${label}`}
        data-testid="gym-set-check"
        className={cn(
          'flex h-12 w-12 items-center justify-center justify-self-end rounded-xl border-2 transition-colors',
          done
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-gray-300 bg-white text-gray-400 hover:border-emerald-600 hover:text-emerald-600',
        )}
      >
        <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
      </button>

      <p className="col-start-2 col-end-4 flex min-w-0 items-center gap-2 text-[11px] text-gray-400">
        <span className="truncate">Last time: {lastText}</span>
        {pr && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
            data-testid="gym-pr-badge"
          >
            <Trophy className="h-3 w-3" aria-hidden="true" />
            {PR_LABEL[pr]}
          </span>
        )}
      </p>
    </div>
  );
});
