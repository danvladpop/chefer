import { View } from 'react-native';
import type { ProteinGuide } from '@chefer/types';
import {
  Card,
  colors,
  CountUp,
  isOverTarget,
  ProgressBar,
  progressOf,
  ProgressRing,
  Text,
} from '@chefer/ui-mobile';
import { cn, dayNutritionCaption, dayStatus, formatKcal, formatNumber } from '@chefer/utils';
import type { RouterOutputs } from '../../../lib/trpc';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { proteinRingLabel } from '../../numbers-mode/numbers-mode-copy';
import { TrainingDayNote } from './training-day-note';

// Port of apps/web/src/features/dashboard/components/nutrition-summary.tsx.
// The calorie ring matches web's (128pt, 12pt stroke, brand brown) and adds
// the MO-06 motion: it animates to what was EATEN today (audit F-DASH-1-2 —
// it used to show planned food) with a count-up in the centre; past 100% of
// the target the ring and the macro bars turn amber with an overflow lap /
// end cap (owner decision 3, 2026-09-25). The chip judges eaten + still-planned against the target (UX-FOOD-05).

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

const RING_SIZE = 128;
const RING_STROKE = 12;
// The widest a caption can be inside the ring without touching the stroke.
/** The caption sits inside a fixed 128 pt ring, so it scales less than body text. */
export const RING_CAPTION_MAX_FONT_SCALE = 1.3;
export const RING_INNER_WIDTH = RING_SIZE - 2 * RING_STROKE - 16;

function MacroBar({
  label,
  value,
  target,
  planned,
}: {
  label: string;
  value: number;
  target: number;
  planned: number;
}) {
  const progress = progressOf(value, target);
  const over = isOverTarget(progress);
  return (
    <View>
      <View className="mb-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-xs font-medium text-gray-700">{label}</Text>
        <Text className={cn('text-xs', over ? 'font-semibold text-amber-700' : 'text-gray-500')}>
          {value}g / {target}g
        </Text>
      </View>
      <ProgressBar
        testID={`macro-${label.toLowerCase()}`}
        accessibilityLabel={`${label}: ${value} of ${target} grams eaten, ${planned} planned`}
        progress={progress}
        overColor={colors.warning}
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
  const targetG = n.adjustedTargets?.proteinG ?? n.protein.targetG;
  const eatenG = Math.round(n.protein.eaten);
  const progress = progressOf(eatenG, targetG);
  const leftG = Math.max(Math.round(targetG) - eatenG, 0);
  // Neutral palette: reaching the goal is green, otherwise just what is left.
  const reached = targetG > 0 && eatenG >= targetG;
  const chip = reached
    ? { text: 'Protein goal reached', bg: 'bg-emerald-100', fg: 'text-emerald-700' }
    : eatenG === 0
      ? { text: 'Nothing logged yet', bg: 'bg-gray-100', fg: 'text-gray-500' }
      : { text: `${leftG} g to go`, bg: 'bg-gray-100', fg: 'text-gray-600' };

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">Today</Text>
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
          accessibilityLabel={`${proteinRingLabel(eatenG, targetG)} eaten today`}
          progress={progress}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
        >
          <CountUp
            testID="protein-count"
            value={eatenG}
            className="text-xl font-bold text-gray-900"
          />
          <Text
            testID="protein-ring-caption"
            numberOfLines={2}
            maxFontSizeMultiplier={RING_CAPTION_MAX_FONT_SCALE}
            style={{ maxWidth: RING_INNER_WIDTH }}
            className="text-center text-xs text-muted-foreground"
          >
            of {formatNumber(Math.round(targetG))} g protein
          </Text>
        </ProgressRing>
        {proteinGuide && (
          <Text testID="protein-guide" className="text-center text-xs text-gray-600">
            {proteinGuide.label}
          </Text>
        )}
        {targetMode && (
          <Text testID="target-mode-label" className="text-center text-xs text-muted-foreground">
            {targetMode === 'OWN' ? 'Your target' : 'Suggested'}
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
  const { proteinOnly } = useNumbersMode();
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
  const { status, label: statusLabel } = dayStatus(
    n.eatenKcal,
    remainingPlannedKcal ?? Math.max(n.plannedKcal - n.eatenKcal, 0),
    target.dailyCalorieTarget,
  );
  const calories = progressOf(n.eatenKcal, target.dailyCalorieTarget);

  // Neutral palette: amber for "past the target" (never red), grey when
  // there is nothing to judge or room is left.
  const statusStyle = {
    over: { bg: 'bg-amber-100', text: 'text-amber-800' },
    heading_over: { bg: 'bg-amber-50', text: 'text-amber-800' },
    under: { bg: 'bg-gray-100', text: 'text-gray-600' },
    on: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    none: { bg: 'bg-gray-100', text: 'text-gray-500' },
  }[status];

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">Today</Text>
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
          accessibilityLabel={`${formatKcal(n.eatenKcal)} of ${formatKcal(target.dailyCalorieTarget)} kcal eaten today`}
          progress={calories}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          overColor={colors.warning}
        >
          <CountUp
            testID="calorie-count"
            value={n.eatenKcal}
            className="text-xl font-bold text-gray-900"
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
            of {formatKcal(target.dailyCalorieTarget)} kcal
          </Text>
        </ProgressRing>
        <Text testID="calorie-remaining" className="text-center text-xs text-gray-500">
          {dayNutritionCaption(n.eatenKcal, n.plannedKcal, target.dailyCalorieTarget)}
        </Text>
        {targetMode && (
          <Text testID="target-mode-label" className="text-center text-xs text-muted-foreground">
            {targetMode === 'OWN' ? 'Your target' : 'Suggested'}
          </Text>
        )}
      </View>

      {/* Macro bars */}
      <View className="gap-3">
        <MacroBar
          label="Protein"
          value={n.protein.eaten}
          target={target.proteinG}
          planned={n.protein.planned}
        />
        <MacroBar
          label="Carbs"
          value={n.carbs.eaten}
          target={target.carbsG}
          planned={n.carbs.planned}
        />
        <MacroBar label="Fat" value={n.fat.eaten} target={target.fatG} planned={n.fat.planned} />
      </View>
    </Card>
  );
}
