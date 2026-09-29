'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import { canOfferSnack, missDirection, scaleFactorFor } from '../plan-miss';
import { aboutKcal } from './DayRecapBar';

// ─── PlanMissSheet (UX-11 T-11.3) ──────────────────────────────────────────────
// Opens from a day's under/over-target status. Neutral, never alarming: fix the
// day with portions (previewed through `mealPlan.scaleDay` apply=false, applied
// with apply=true), add a snack (under target only, never on a weight-loss goal),
// or keep the day as planned. Web mirror of the mobile plan-miss sheet.

export interface PlanMissSheetProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  dayOfWeek: number;
  dayName: string;
  /** The day's planned kcal (portion-aware) and its target. */
  kcal: number;
  target: number;
  proteinGapG?: number | undefined;
  /** `targets.get().inputs.goal`; unknown hides `Add a snack`. */
  goal: string | null | undefined;
  onAddSnack?: (() => void) | undefined;
  onApplied: (message: string) => void;
}

interface Preview {
  kcal: number;
  protein: number;
}

export function PlanMissSheet({
  open,
  onClose,
  planId,
  dayOfWeek,
  dayName,
  kcal,
  target,
  proteinGapG,
  goal,
  onAddSnack,
  onApplied,
}: PlanMissSheetProps) {
  const utils = trpc.useUtils();
  const direction = missDirection(kcal, target, 0) ?? 'under';
  const factor = scaleFactorFor(kcal, target);
  const scalable = factor !== 1;
  const [preview, setPreview] = useState<Preview | null>(null);

  const previewMutation = trpc.mealPlan.scaleDay.useMutation({
    onSuccess: (data) => setPreview({ kcal: data.kcal, protein: data.protein }),
  });
  const applyMutation = trpc.mealPlan.scaleDay.useMutation({
    onSuccess: () => {
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
      void utils.dashboard.invalidate();
      onApplied(
        direction === 'under' ? `${dayName}: portions increased.` : `${dayName}: portions reduced.`,
      );
      onClose();
    },
  });

  // Preview each time the sheet opens for a day — the sheet stays mounted.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    if (scalable) previewMutation.mutate({ planId, dayOfWeek, factor, apply: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one preview per open/day, not per mutation state
  }, [open, planId, dayOfWeek, factor, scalable]);

  const showSnack = onAddSnack !== undefined && canOfferSnack(direction, goal);
  const optionCls =
    'flex min-h-11 w-full flex-col items-start justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${aboutKcal(kcal - target)} ${direction} target`}
      description={`${dayName}: planned ${kcal.toLocaleString('en-US')} kcal, target ${target.toLocaleString('en-US')} kcal`}
      size="sm"
    >
      <div className="flex flex-col gap-2 px-5 pb-5" data-testid="plan-miss-sheet">
        {proteinGapG !== undefined && proteinGapG > 0 && (
          <p className="text-xs text-gray-600">Protein is about {proteinGapG} g short too.</p>
        )}
        {scalable && (
          <button
            type="button"
            data-testid="plan-miss-portions"
            disabled={applyMutation.isPending}
            onClick={() => applyMutation.mutate({ planId, dayOfWeek, factor, apply: true })}
            className={optionCls}
          >
            <span className="text-sm font-semibold text-gray-900">
              {direction === 'under' ? 'Bigger portions' : 'Smaller portions'}
            </span>
            <span className="text-xs text-gray-600">
              {preview
                ? `Brings the day to about ${preview.kcal.toLocaleString('en-US')} kcal · ${preview.protein} g protein`
                : previewMutation.isError
                  ? 'Adjusts every meal on this day'
                  : 'Checking the numbers…'}
            </span>
          </button>
        )}
        {showSnack && (
          <button
            type="button"
            data-testid="plan-miss-snack"
            onClick={() => {
              onClose();
              onAddSnack();
            }}
            className={optionCls}
          >
            <span className="text-sm font-semibold text-gray-900">Add a snack</span>
            <span className="text-xs text-gray-600">A small extra to close the gap</span>
          </button>
        )}
        <button type="button" data-testid="plan-miss-keep" onClick={onClose} className={optionCls}>
          <span className="text-sm font-semibold text-gray-900">Keep it</span>
          <span className="text-xs text-gray-600">Leave {dayName} as planned</span>
        </button>
        {(applyMutation.isError || previewMutation.isError) && (
          <p role="alert" className="text-xs text-red-600">
            {applyMutation.error?.message ??
              previewMutation.error?.message ??
              'Could not change the portions. Try again.'}
          </p>
        )}
      </div>
    </Sheet>
  );
}
