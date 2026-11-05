'use client';

import { useEffect, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import {
  capProteinScaleFactor,
  formatKcal,
  isLossGoal,
  LOSS_PROTEIN_KCAL_INCREASE_CAP,
  userFacingErrorMessage,
} from '@chefer/utils';
import { canOfferSnack, missDirection, scaleFactorFor } from '../plan-miss';
import { aboutKcalAmount } from './DayRecapBar';

// ─── PlanMissSheet (UX-11 T-11.3) ──────────────────────────────────────────────
// Opens from a day's under/over-target status. Neutral, never alarming: fix the
// day with portions (previewed through `mealPlan.scaleDay` apply=false, applied
// with apply=true), add a snack (under target only, never on a weight-loss goal),
// or keep the day as planned. Web mirror of the mobile plan-miss sheet.
//
// UX-PLAN-08 (WP-07): on a weight-loss goal "Bigger portions" never goes past
// +10 % (capProteinScaleFactor; it used to offer "+503 kcal" to fix protein) and
// a protein gap is answered with a protein snack first.

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
  const { t } = useT();
  // WP-08: protein-only mode judges a day by its protein alone and states no calorie figure.
  const { proteinOnly, noNumbers } = useNumbersMode();
  const proteinGap = proteinGapG !== undefined && proteinGapG > 0;
  const direction =
    proteinOnly && proteinGap ? 'under' : (missDirection(kcal, target, 0) ?? 'under');
  const rawFactor = scaleFactorFor(kcal, target);
  // UX-PLAN-08: the portion step a loss goal may take is held to +10 %; null
  // = nothing worth offering (a step under 3 %), so the option is hidden.
  const factor = capProteinScaleFactor(rawFactor, goal) ?? 1;
  const capped = factor < rawFactor;
  // Protein-only only ever offers bigger portions (to close a protein gap).
  const scalable = proteinOnly ? factor > 1 : factor !== 1;
  const [preview, setPreview] = useState<Preview | null>(null);

  const previewMutation = trpc.mealPlan.scaleDay.useMutation({
    meta: { silent: true },
    onSuccess: (data) => setPreview({ kcal: data.kcal, protein: data.protein }),
  });
  const applyMutation = trpc.mealPlan.scaleDay.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.mealPlan.invalidate();
      void utils.shoppingList.invalidate();
      void utils.dashboard.invalidate();
      onApplied(
        t(direction === 'under' ? 'plan.miss.appliedUp' : 'plan.miss.appliedDown', {
          day: dayName,
        }),
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

  const proteinShort = proteinGapG !== undefined && proteinGapG > 0;
  const lossProteinSnack = direction === 'under' && isLossGoal(goal) && proteinShort;
  const showSnack =
    onAddSnack !== undefined && (canOfferSnack(direction, goal) || lossProteinSnack);
  const snackTitle = t(proteinShort ? 'plan.miss.snackProtein' : 'plan.miss.snack');
  const optionCls =
    'flex min-h-11 w-full flex-col items-start justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50';

  const snackButton = showSnack ? (
    <button
      type="button"
      data-testid="plan-miss-snack"
      onClick={() => {
        onClose();
        onAddSnack();
      }}
      className={optionCls}
    >
      <span className="text-sm font-semibold text-gray-900">{snackTitle}</span>
      <span className="text-xs text-gray-600">
        {t(proteinShort ? 'plan.miss.snackProteinHint' : 'plan.miss.snackHint')}
      </span>
    </button>
  ) : null;

  // Lane E3 "Hide numbers": a fit-to-target sheet has nothing to say without figures.
  if (noNumbers) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        proteinOnly
          ? t('plan.miss.titleProtein')
          : t(
              direction === 'under'
                ? 'plan.dayTotals.aboutUnderKcal'
                : 'plan.dayTotals.aboutOverKcal',
              {
                kcal: aboutKcalAmount(kcal - target),
              },
            )
      }
      description={
        proteinOnly
          ? proteinGap
            ? t('plan.miss.descProteinGap', { day: dayName, grams: proteinGapG })
            : t('plan.miss.descAsPlanned', { day: dayName })
          : t('plan.miss.descKcal', {
              day: dayName,
              kcal: formatKcal(kcal),
              target: formatKcal(target),
            })
      }
      size="sm"
    >
      <div className="flex flex-col gap-2 px-5 pb-5" data-testid="plan-miss-sheet">
        {!proteinOnly && proteinGapG !== undefined && proteinGapG > 0 && (
          <p className="text-xs text-gray-600">
            {t('plan.miss.proteinAlso', { grams: proteinGapG })}
          </p>
        )}
        {lossProteinSnack && snackButton}
        {scalable && (
          <button
            type="button"
            data-testid="plan-miss-portions"
            disabled={applyMutation.isPending}
            onClick={() => applyMutation.mutate({ planId, dayOfWeek, factor, apply: true })}
            className={optionCls}
          >
            <span className="text-sm font-semibold text-gray-900">
              {t(
                direction === 'under'
                  ? capped
                    ? 'plan.miss.slightlyBigger'
                    : 'plan.miss.bigger'
                  : 'plan.miss.smaller',
              )}
            </span>
            <span className="text-xs text-gray-600">
              {preview
                ? [
                    capped
                      ? t('plan.miss.heldToCap', {
                          percent: Math.round(LOSS_PROTEIN_KCAL_INCREASE_CAP * 100),
                        })
                      : null,
                    proteinOnly
                      ? t('plan.miss.bringsProtein', { grams: preview.protein })
                      : t('plan.miss.bringsKcalProtein', {
                          kcal: formatKcal(preview.kcal),
                          grams: preview.protein,
                        }),
                  ]
                    .filter(Boolean)
                    .join(' ')
                : previewMutation.isError
                  ? t('plan.miss.adjustsEvery')
                  : t('plan.miss.checking')}
            </span>
          </button>
        )}
        {!lossProteinSnack && snackButton}
        <button type="button" data-testid="plan-miss-keep" onClick={onClose} className={optionCls}>
          <span className="text-sm font-semibold text-gray-900">{t('plan.miss.keep')}</span>
          <span className="text-xs text-gray-600">{t('plan.miss.keepHint', { day: dayName })}</span>
        </button>
        {(applyMutation.isError || previewMutation.isError) && (
          <p role="alert" className="text-xs text-red-600">
            {userFacingErrorMessage(
              applyMutation.error ?? previewMutation.error,
              t('plan.miss.applyError'),
            )}
          </p>
        )}
      </div>
    </Sheet>
  );
}
