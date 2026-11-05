'use client';

import Link from 'next/link';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import type { RouterOutputs } from '@/lib/trpc';
import { ChevronRight } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import type { ProteinGuide } from '@chefer/types';
import { CountUp, ProgressBar, progressOf, ProgressRing } from '@chefer/ui';
import { cn, dayStatus, formatKcal, formatNumber, type DayStatusResult } from '@chefer/utils';
import { TrainingDayNote } from './training-day-note';

/** The status pill's text ("On track", "Over by 120 kcal"), from `dayStatus`. */
export function dayStatusText(t: Translator['t'], result: DayStatusResult): string {
  switch (result.status) {
    case 'over':
      return t('today.home.status.over.kcal', { value: formatKcal(result.overByKcal) });
    case 'heading_over':
      return t('today.home.status.headingOver');
    case 'under':
      return t('today.home.status.under');
    case 'on':
      return t('today.home.status.on');
    case 'none':
      return t('today.home.status.none');
  }
}

/** "1,870 planned · 1,200 left" — left = target − eaten, never negative. */
export function dayCaptionText(
  t: Translator['t'],
  eatenKcal: number,
  plannedKcal: number,
  targetKcal: number,
): string {
  const left = formatKcal(Math.max(targetKcal - eatenKcal, 0));
  const overBy = eatenKcal - targetKcal;
  const over = formatKcal(overBy);
  if (plannedKcal > 0) {
    const planned = formatKcal(plannedKcal);
    return overBy > 0
      ? t('today.home.caption.plannedOver.kcal', { planned, over })
      : t('today.home.caption.plannedLeft.kcal', { planned, left });
  }
  return overBy > 0
    ? t('today.home.caption.over.kcal', { over })
    : t('today.home.caption.left.kcal', { left });
}

/** "2 of 3 planned meals eaten" — the qualitative line in "Hide numbers". */
export function onPlanText(t: Translator['t'], eaten: number, planned: number): string {
  if (planned <= 0) return t('today.hideNumbers.noPlan');
  if (eaten <= 0) return t('today.hideNumbers.onPlanEmpty');
  if (eaten >= planned) return t('today.hideNumbers.onPlanDone');
  return t('today.hideNumbers.onPlanLine', { eaten, count: planned });
}

// ─── Nutrition summary ────────────────────────────────────────────────────────
// Calorie ring + macro bars for today. Lives in the dashboard's right rail at
// xl+, and inline in the main column below that — it used to be `hidden lg:flex`
// only, which meant phones lost the most useful panel on the page entirely.

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

interface NutritionSummaryProps {
  nutrition: Nutrition;
  /** Name of the next planned meal, used for the AI hint. Omit to hide it. */
  nextMealName?: string | undefined;
  className?: string | undefined;
  /** §2.11, T-35.5: the ring's label — "Your target" (OWN) vs "Suggested" (SUGGESTED). Omitted while unknown. */
  targetMode?: 'SUGGESTED' | 'OWN' | undefined;
  /** Planned meals still to eat today (UX-FOOD-05). Unknown → the plan minus what was eaten. */
  remainingPlannedKcal?: number | undefined;
  /** WP-08: the per-meal protein guide ("30–40 g per meal"), shown in protein-only mode. */
  proteinGuide?: ProteinGuide | undefined;
  /** Lane E3: planned meals eaten / planned today — what "Hide numbers" shows. */
  onPlan?: { eaten: number; planned: number } | undefined;
}

/**
 * WP-08 protein-only Today: the ring is a PROTEIN ring ("72 of 120 g protein")
 * with the per-meal guide under it. No kcal caption, no macro bars. The week is
 * still balanced on calories underneath; this card just never says so. MO-06
 * motion, same primitives as the calorie ring.
 */
function ProteinSummary({
  nutrition: n,
  nextMealName,
  className,
  targetMode,
  proteinGuide,
}: Pick<NutritionSummaryProps, 'nutrition' | 'nextMealName' | 'className' | 'targetMode'> & {
  proteinGuide?: ProteinGuide | undefined;
}) {
  const { t } = useT();
  const targetG = n.adjustedTargets?.proteinG ?? n.protein.targetG;
  const eatenG = Math.round(n.protein.eaten);
  const leftG = Math.max(Math.round(targetG) - eatenG, 0);
  // Neutral palette: reaching the goal is green, otherwise just what is left.
  const reached = targetG > 0 && eatenG >= targetG;
  const chip = reached
    ? { text: t('today.home.protein.reached'), style: 'bg-emerald-100 text-emerald-700' }
    : eatenG === 0
      ? { text: t('today.home.nothingLogged'), style: 'bg-gray-100 text-gray-600' }
      : {
          text: t('today.home.protein.toGo', { value: formatNumber(leftG) }),
          style: 'bg-gray-100 text-gray-600',
        };

  return (
    <div
      data-testid="nutrition-summary"
      className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', className)}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {t('today.home.title')}
        </p>
        <span
          data-testid="nutrition-status"
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
            chip.style,
          )}
        >
          {chip.text}
        </span>
      </div>

      {n.trainingDay && <TrainingDayNote t={n.trainingDay} />}

      <div className="flex flex-col items-center gap-2 py-2">
        <ProgressRing
          data-testid="protein-ring"
          label={t('today.home.protein.ringLabel', {
            eaten: formatNumber(eatenG),
            target: formatNumber(Math.round(targetG)),
          })}
          progress={progressOf(eatenG, targetG)}
          size={128}
          strokeWidth={12}
        >
          <CountUp value={eatenG} className="text-xl font-bold text-gray-900" />
          <span className="max-w-[88px] text-center text-xs leading-tight text-gray-500">
            {t('today.home.protein.ringCaption', { target: formatNumber(Math.round(targetG)) })}
          </span>
        </ProgressRing>
        {proteinGuide && (
          <p data-testid="protein-guide" className="text-center text-xs text-gray-600">
            {proteinGuide.label}
          </p>
        )}
        {targetMode && (
          <p data-testid="target-mode-label" className="text-center text-xs text-muted-foreground">
            {targetMode === 'OWN'
              ? t('today.home.targetMode.own')
              : t('today.home.targetMode.suggested')}
          </p>
        )}
      </div>

      <NutritionSummaryLinks nextMealName={nextMealName} />
    </div>
  );
}

/** "Up next" and the rail-only quick links, shared by both modes. */
function NutritionSummaryLinks({ nextMealName }: { nextMealName?: string | undefined }) {
  const { t } = useT();
  return (
    <>
      {/* Next meal + a way to log it — the old line claimed every meal
          "supports your daily nutrition goals", which wasn't checked (F-PM-4). */}
      {nextMealName && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[#fff3e8] px-3 py-2.5">
          <p className="min-w-0 text-xs text-[#944a00]">
            {rich(t, 'today.home.upNext', { name: <strong>{nextMealName}</strong> })}
          </p>
          <Link
            href="/tracker"
            className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-[#944a00] hover:underline"
          >
            {t('today.home.logWhatYouAte')}
          </Link>
        </div>
      )}

      {/* Quick links — redundant with the tab bar on mobile, so rail-only */}
      <div className="mt-4 hidden flex-col gap-1.5 xl:flex">
        <Link
          href="/meal-plan"
          className="flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
        >
          {t('today.home.links.mealPlanner')} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/shopping-list"
          className="flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
        >
          {t('today.home.links.shoppingList')} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
}

export function NutritionSummary({
  nutrition: n,
  nextMealName,
  className,
  targetMode,
  remainingPlannedKcal,
  proteinGuide,
  onPlan,
}: NutritionSummaryProps) {
  const { t } = useT();
  const { proteinOnly, noNumbers } = useNumbersMode();
  // Lane E3 "Hide numbers": no ring, no figures — "Today so far" instead.
  if (noNumbers) {
    if (!onPlan) return null;
    const line = onPlanText(t, onPlan.eaten, onPlan.planned);
    return (
      <div
        data-testid="nutrition-on-plan"
        className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', className)}
      >
        <h2 className="text-sm font-semibold text-gray-900">
          {t('today.hideNumbers.onPlanTitle')}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{line}</p>
        {onPlan.planned > 0 && (
          <ProgressBar
            className="mt-3"
            label={line}
            progress={Math.min(1, onPlan.eaten / onPlan.planned)}
          />
        )}
      </div>
    );
  }
  if (proteinOnly) {
    return (
      <ProteinSummary
        nutrition={n}
        nextMealName={nextMealName}
        className={className}
        targetMode={targetMode}
        proteinGuide={proteinGuide}
      />
    );
  }
  // Lifters on a training day get the bumped targets (free since WP-07) (audit P2-4);
  // everyone else keeps the base targets the older fields carry.
  const target = n.adjustedTargets ?? {
    dailyCalorieTarget: n.dailyCalorieTarget,
    proteinG: n.protein.targetG,
    carbsG: n.carbs.targetG,
    fatG: n.fat.targetG,
  };
  // The ring shows what was EATEN today (audit F-DASH-1-2: it showed planned
  // food — "540 remaining" with 6,070 kcal logged). The chip judges the plan
  // (three-state honesty, review P-2) via the shared rules in @chefer/utils.
  // UX-FOOD-05: the pill looks at eaten + what is still planned vs the target,
  // not the plan alone — it used to stay green 871 kcal over.
  const statusResult = dayStatus(
    n.eatenKcal,
    remainingPlannedKcal ?? Math.max(n.plannedKcal - n.eatenKcal, 0),
    target.dailyCalorieTarget,
  );
  const targetStatus = statusResult.status;
  const statusLabel = dayStatusText(t, statusResult);

  return (
    <div
      data-testid="nutrition-summary"
      className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', className)}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {t('today.home.title')}
        </p>
        <span
          data-testid="nutrition-status"
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
            // Lane E3: past the target is grey like "room left" — never amber or red.
            targetStatus === 'over' && 'bg-gray-100 text-gray-700',
            targetStatus === 'heading_over' && 'bg-gray-100 text-gray-600',
            targetStatus === 'under' && 'bg-gray-100 text-gray-600',
            targetStatus === 'on' && 'bg-emerald-100 text-emerald-700',
            targetStatus === 'none' && 'bg-gray-100 text-gray-600',
          )}
        >
          {statusLabel}
        </span>
      </div>

      {n.trainingDay && <TrainingDayNote t={n.trainingDay} />}

      {/* Ring + macros sit side by side on wide phones/tablets, stacked in the
          narrow desktop rail. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 xl:flex-col xl:gap-4">
        {/* Calorie ring */}
        <div className="flex shrink-0 flex-col items-center gap-2 self-center py-2">
          {/* MO-06: sweeps from its previous value with a count-up; past
              100% it turns amber with an overflow lap (mobile parity). */}
          <ProgressRing
            data-testid="calorie-ring"
            label={t('today.home.ring.label.kcal', {
              eaten: String(n.eatenKcal),
              target: String(target.dailyCalorieTarget),
            })}
            progress={progressOf(n.eatenKcal, target.dailyCalorieTarget)}
            size={128}
            strokeWidth={12}
          >
            <CountUp value={n.eatenKcal} className="text-xl font-bold text-gray-900" />
            <span className="max-w-[88px] text-center text-xs leading-tight text-gray-500">
              {t('today.home.ring.captionEaten.kcal', {
                target: formatKcal(target.dailyCalorieTarget),
              })}
            </span>
          </ProgressRing>
          <p className="text-center text-xs text-gray-500">
            {dayCaptionText(t, n.eatenKcal, n.plannedKcal, target.dailyCalorieTarget)}
          </p>
          {targetMode && (
            <p
              data-testid="target-mode-label"
              className="text-center text-xs text-muted-foreground"
            >
              {targetMode === 'OWN'
                ? t('today.home.targetMode.own')
                : t('today.home.targetMode.suggested')}
            </p>
          )}
        </div>

        {/* Macro bars */}
        <div className="flex flex-1 flex-col gap-3 sm:min-w-0">
          {[
            {
              id: 'protein',
              label: t('today.home.macros.protein'),
              v: n.protein.eaten,
              goal: target.proteinG,
            },
            {
              id: 'carbs',
              label: t('today.home.macros.carbs'),
              v: n.carbs.eaten,
              goal: target.carbsG,
            },
            { id: 'fat', label: t('today.home.macros.fat'), v: n.fat.eaten, goal: target.fatG },
          ].map(({ id, label, v, goal }) => (
            <div key={id}>
              {/* gap-2 + whitespace-nowrap: in the 288px rail a three-digit
                  pair ("135g / 140g") butted straight up against the label. */}
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-gray-700">{label}</span>
                <span className="whitespace-nowrap text-gray-500">
                  {t('today.home.macros.value', { value: v, target: goal })}
                </span>
              </div>
              <ProgressBar
                label={t('today.home.macros.label', { name: label, value: v, target: goal })}
                progress={progressOf(v, goal)}
              />
            </div>
          ))}
        </div>
      </div>

      <NutritionSummaryLinks nextMealName={nextMealName} />
    </div>
  );
}
