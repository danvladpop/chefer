'use client';

import { useEffect, useState } from 'react';
import {
  COACHING_COPY,
  type ExerciseLoadType,
  type ProgressionOverride,
  type Suggestion,
  type WeightUnit,
} from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { formatLoad, kgToUnit } from '@chefer/utils';
import { buildOverridePayload } from '../override-payload';

export interface OverrideTargetSheetTarget {
  exerciseId: string;
  repBucket: string;
  exerciseName: string;
  loadType: ExerciseLoadType;
  /** UX-GYM-19: dumbbell / kettlebell targets read "20 kg each". */
  perHand?: boolean;
  isTimed: boolean;
  suggestion: Suggestion;
  override: ProgressionOverride | null;
  /** Trainer coaching: the rep range this target is keyed by ("6-8"), shown in the trainer's wording. */
  repRangeLabel?: string;
}

export interface OverrideTargetSheetProps {
  target: OverrideTargetSheetTarget | null;
  unit: WeightUnit;
  onClose: () => void;
  onSave: (weightKg: number, reps: number[]) => void;
  onReset: () => void;
  saving?: boolean;
  /**
   * Trainer coaching: the trainer sets the CLIENT's next-session target. The
   * sheet then says whose target it is and when it applies (spec §2.5, §6.2).
   */
  coaching?: { clientName: string };
}

/** D5c target-level edit: override next session's weight and reps for one exercise. */
export function OverrideTargetSheet({
  target,
  unit,
  onClose,
  onSave,
  onReset,
  saving = false,
  coaching,
}: OverrideTargetSheetProps) {
  const active = target?.override ?? null;
  const suggestion = target?.suggestion;
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  useEffect(() => {
    if (!target) return;
    const weightKg = active?.weightKg ?? suggestion?.weightKg ?? 0;
    const repsValue = active?.reps ?? suggestion?.reps ?? [];
    setWeight(String(kgToUnit(weightKg, unit)));
    setReps(String(repsValue[0] ?? ''));
    // Re-seed only when the sheet opens for a (possibly new) exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.exerciseId, target?.repBucket]);

  if (!target || !suggestion) return null;

  const sets = active?.reps.length ?? suggestion.sets;
  const unitLabel = unit === 'LB' ? 'lb' : 'kg';
  const suggestedText = formatLoad(suggestion.weightKg, unit, target.loadType, {
    each: target.perHand,
  });

  const handleSave = () => {
    const payload = buildOverridePayload({
      weightDisplay: Number(weight),
      repsDisplay: Number(reps),
      unit,
      sets,
    });
    if (!payload) return;
    onSave(payload.weightKg, payload.reps);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={target.exerciseName}
      description={
        coaching
          ? `Set ${coaching.clientName}’s target for the next session`
          : "Override the next session's target"
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={!active || saving}
          >
            {coaching ? COACHING_COPY.trainer.resetToSuggestion : 'Reset to suggestion'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-sm text-gray-500">
          The engine suggests <span className="font-medium text-gray-700">{suggestedText}</span> for{' '}
          {suggestion.sets} set{suggestion.sets === 1 ? '' : 's'}.{' '}
          {coaching
            ? COACHING_COPY.trainer.appliesTo(
                coaching.clientName,
                target.exerciseName,
                (target.repRangeLabel ?? target.repBucket).replace('-', '–'),
              )
            : 'Set your own target for next time, or reset to let it decide again.'}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Weight ({unitLabel})</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:h-10 sm:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            {target.isTimed ? 'Seconds per set' : 'Reps per set'}
          </span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min={0}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:h-10 sm:text-sm"
          />
        </label>

        {active && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Currently overridden. Saving replaces it; Reset removes it and lets the engine suggest
            again.
          </p>
        )}
      </div>
    </Sheet>
  );
}
