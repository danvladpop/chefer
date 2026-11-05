import { View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import type { ProteinGuide } from '@chefer/types';
import {
  Card,
  CountUp,
  isOverTarget,
  ProgressBar,
  progressOf,
  ProgressRing,
  Text,
} from '@chefer/ui-mobile';
import { cn, dayStatus, formatKcal, formatNumber, type DayStatusResult } from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import type { RouterOutputs } from '../../../lib/trpc';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { TrainingDayNote } from './training-day-note';

// Port of apps/web/src/features/dashboard/components/nutrition-summary.tsx.
// The calorie ring matches web's (128pt, 12pt stroke, brand brown) and adds
// the MO-06 motion: it animates to what was EATEN today (audit F-DASH-1-2 —
// it used to show planned food) with a count-up in the centre. Past 100% of
// the target the ring and bars stay brand and say so in words — lane E3
// (market review 2026-10, eating-disorder-safe) replaces owner decision 3's
// amber (2026-09-25). The chip judges eaten + still-planned against the target (UX-FOOD-05).

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

const RING_SIZE = 128;
const RING_STROKE = 12;
// The widest a caption can be inside the ring without touching the stroke.
/** The caption sits inside a fixed 128 pt ring, so it scales less than body text. */
export const RING_CAPTION_MAX_FONT_SCALE = 1.3;
export const RING_INNER_WIDTH = RING_SIZE - 2 * RING_STROKE - 16;

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

function MacroBar({
  id,
  label,
  value,
  target,
  planned,
}: {
  /** The testID's stable part ("protein"), whatever the UI language. */
  id: string;
  label: string;
  value: number;
  target: number;
  planned: number;
}) {
  const { t } = useT();
  const progress = progressOf(value, target);
  const over = isOverTarget(progress);
  return (
    <View>
      <View className="mb-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-xs font-medium text-label-secondary">{label}</Text>
        {/* Lane E3: over target is said, never coloured as a warning. */}
        <Text className={cn('text-xs text-label-tertiary', over && 'font-semibold')}>
          {t('today.home.macros.value', { value, target })}
        </Text>
      </View>
      <ProgressBar
        testID={`macro-${id}`}
        accessibilityLabel={t('today.home.macros.labelPlanned', {
          name: label,
          value,
          target,
          planned,
        })}
        progress={progress}
      />
    </View>
  );
}

/**
 * WP-08 protein-only Today: the ring is a PROTEIN ring ("72 of 120 g protein")
 * with the per-meal guide under it. No kcal caption, no macro bars. The week
 * is still balanced on calories underneath; this card just never says so.
 * MO-06 motion as the calorie ring (same primitives).
 */
function ProteinSummary({
  nutrition: n,
  targetMode,
  proteinGuide,
}: {
  nutrition: Nutrition;
  targetMode?: 'SUGGESTED' | 'OWN' | undefined;
  proteinGuide?: ProteinGuide | undefined;
}) {
  const { t } = useT();
  const targetG = n.adjustedTargets?.proteinG ?? n.protein.targetG;
  const eatenG = Math.round(n.protein.eaten);
  const progress = progressOf(eatenG, targetG);
  const leftG = Math.max(Math.round(targetG) - eatenG, 0);
  // Neutral palette: reaching the goal is green, otherwise just what is left.
  const reached = targetG > 0 && eatenG >= targetG;
  const chip = reached
    ? { text: t('today.home.protein.reached'), bg: 'bg-positive/15', fg: 'text-positive' }
    : eatenG === 0
      ? {
          text: t('today.home.nothingLogged'),
          bg: 'bg-surface-sunken',
          fg: 'text-label-tertiary',
        }
      : {
          text: t('today.home.protein.toGo', { value: formatNumber(leftG) }),
          bg: 'bg-surface-sunken',
          fg: 'text-label-secondary',
        };

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-label-tertiary">
          {t('today.home.title')}
        </Text>
        <View className={cn('rounded-full px-2.5 py-0.5', chip.bg)}>
          <Text testID="nutrition-status" className={cn('text-xs font-bold uppercase', chip.fg)}>
            {chip.text}
          </Text>
        </View>
      </View>

      {n.trainingDay ? <TrainingDayNote t={n.trainingDay} /> : null}

      <View className="items-center gap-2">
        <ProgressRing
          testID="protein-ring"
          accessibilityLabel={t('today.home.protein.ringLabel', {
            eaten: formatNumber(eatenG),
            target: formatNumber(Math.round(targetG)),
          })}
          progress={progress}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
        >
          <CountUp testID="protein-count" value={eatenG} className="text-xl font-bold text-label" />
          <Text
            testID="protein-ring-caption"
            numberOfLines={2}
            maxFontSizeMultiplier={RING_CAPTION_MAX_FONT_SCALE}
            style={{ maxWidth: RING_INNER_WIDTH }}
            className="text-center text-xs text-muted-foreground"
          >
            {t('today.home.protein.ringCaption', { target: formatNumber(Math.round(targetG)) })}
          </Text>
        </ProgressRing>
        {proteinGuide && (
          <Text testID="protein-guide" className="text-center text-xs text-label-secondary">
            {proteinGuide.label}
          </Text>
        )}
        {targetMode && (
          <Text testID="target-mode-label" className="text-center text-xs text-muted-foreground">
            {targetMode === 'OWN'
              ? t('today.home.targetMode.own')
              : t('today.home.targetMode.suggested')}
          </Text>
        )}
      </View>
    </Card>
  );
}

export function NutritionSummary({
  nutrition: n,
  targetMode,
  remainingPlannedKcal,
  proteinGuide,
}: {
  nutrition: Nutrition;
  /** WP-08: the per-meal protein guide ("30–40 g per meal"), shown in protein-only mode. */
  proteinGuide?: ProteinGuide | undefined;
  /** Planned meals still to eat today (UX-FOOD-05). Unknown → the plan minus what was eaten. */
  remainingPlannedKcal?: number;
  /** §2.11, T-35.5: the ring's label — "Your target" (OWN) vs "Suggested" (SUGGESTED). Omitted while unknown. */
  targetMode?: 'SUGGESTED' | 'OWN';
}) {
  const { t } = useT();
  const { proteinOnly, noNumbers } = useNumbersMode();
  // Lane E3 "Hide numbers": no ring, no figures — the day's meals list says it.
  if (noNumbers) return null;
  if (proteinOnly) {
    return <ProteinSummary nutrition={n} targetMode={targetMode} proteinGuide={proteinGuide} />;
  }
  // Lifters on a training day get the bumped targets, free for everyone (audit P2-4, WP-07);
  // everyone else keeps the base targets the older fields carry.
  const target = n.adjustedTargets ?? {
    dailyCalorieTarget: n.dailyCalorieTarget,
    proteinG: n.protein.targetG,
    carbsG: n.carbs.targetG,
    fatG: n.fat.targetG,
  };
  // UX-FOOD-05: eaten + what is still planned vs the target — not the plan alone.
  const statusResult = dayStatus(
    n.eatenKcal,
    remainingPlannedKcal ?? Math.max(n.plannedKcal - n.eatenKcal, 0),
    target.dailyCalorieTarget,
  );
  const status = statusResult.status;
  const statusLabel = dayStatusText(t, statusResult);
  const calories = progressOf(n.eatenKcal, target.dailyCalorieTarget);

  // Neutral palette (lane E3, eating-disorder-safe): "past the target" is grey
  // like "room left" — never amber or red; only "on target" gets a colour.
  const statusStyle = {
    over: { bg: 'bg-surface-sunken', text: 'text-label-secondary' },
    heading_over: { bg: 'bg-surface-sunken', text: 'text-label-secondary' },
    under: { bg: 'bg-surface-sunken', text: 'text-label-secondary' },
    on: { bg: 'bg-positive/15', text: 'text-positive' },
    none: { bg: 'bg-surface-sunken', text: 'text-label-tertiary' },
  }[status];

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-label-tertiary">
          {t('today.home.title')}
        </Text>
        <View className={cn('rounded-full px-2.5 py-0.5', statusStyle.bg)}>
          <Text
            testID="nutrition-status"
            className={cn('text-xs font-bold uppercase', statusStyle.text)}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      {n.trainingDay ? (
        // The base fields are the rest-day targets; the sheet adds the day's bump (UX-FOOD-19).
        <TrainingDayNote
          t={n.trainingDay}
          restKcal={n.dailyCalorieTarget}
          restProteinG={n.protein.targetG}
        />
      ) : null}

      {/* Calorie ring — stacked above the macros, like web's phone layout. */}
      <View className="mb-4 items-center gap-2">
        <ProgressRing
          testID="calorie-ring"
          accessibilityLabel={t('today.home.ring.label.kcal', {
            eaten: formatKcal(n.eatenKcal),
            target: formatKcal(target.dailyCalorieTarget),
          })}
          progress={calories}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
        >
          <CountUp
            testID="calorie-count"
            value={n.eatenKcal}
            className="text-xl font-bold text-label"
          />
          {/* UX-FOOD-24: "of 1,701 kcal eaten" ran into the stroke at 390 pt and
              larger text. Short caption ("eaten" lives in the ring's accessible
              name and the CountUp), held inside the ring's inner circle; wraps at large text (no
              adjustsFontSizeToFit — it sticks small on the new architecture). */}
          <Text
            testID="calorie-ring-caption"
            numberOfLines={2}
            maxFontSizeMultiplier={RING_CAPTION_MAX_FONT_SCALE}
            style={{ maxWidth: RING_INNER_WIDTH }}
            className="text-center text-xs text-muted-foreground"
          >
            {t('today.home.ring.caption.kcal', { target: formatKcal(target.dailyCalorieTarget) })}
          </Text>
        </ProgressRing>
        <Text testID="calorie-remaining" className="text-center text-xs text-label-tertiary">
          {dayCaptionText(t, n.eatenKcal, n.plannedKcal, target.dailyCalorieTarget)}
        </Text>
        {targetMode && (
          <Text testID="target-mode-label" className="text-center text-xs text-muted-foreground">
            {targetMode === 'OWN'
              ? t('today.home.targetMode.own')
              : t('today.home.targetMode.suggested')}
          </Text>
        )}
      </View>

      {/* Macro bars */}
      <View className="gap-3">
        <MacroBar
          id="protein"
          label={t('today.home.macros.protein')}
          value={n.protein.eaten}
          target={target.proteinG}
          planned={n.protein.planned}
        />
        <MacroBar
          id="carbs"
          label={t('today.home.macros.carbs')}
          value={n.carbs.eaten}
          target={target.carbsG}
          planned={n.carbs.planned}
        />
        <MacroBar
          id="fat"
          label={t('today.home.macros.fat')}
          value={n.fat.eaten}
          target={target.fatG}
          planned={n.fat.planned}
        />
      </View>
    </Card>
  );
}
