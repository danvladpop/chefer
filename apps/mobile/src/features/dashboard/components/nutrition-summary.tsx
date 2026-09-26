import { View } from 'react-native';
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
import { cn, dayNutritionCaption, PLAN_STATUS_LABEL, planStatus } from '@chefer/utils';
import type { RouterOutputs } from '../../../lib/trpc';
import { TrainingDayNote } from './training-day-note';

// Port of apps/web/src/features/dashboard/components/nutrition-summary.tsx.
// The calorie ring matches web's (128pt, 12pt stroke, brand brown) and adds
// the MO-06 motion: it animates to what was EATEN today (audit F-DASH-1-2 —
// it used to show planned food) with a count-up in the centre; past 100% of
// the target the ring and the macro bars turn amber with an overflow lap /
// end cap (owner decision 3, 2026-09-25). The chip judges today's plan.

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

const RING_SIZE = 128;
const RING_STROKE = 12;

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

export function NutritionSummary({ nutrition: n }: { nutrition: Nutrition }) {
  // Premium lifters on a training day get the bumped targets (audit P2-4);
  // everyone else keeps the base targets the older fields carry.
  const target = n.adjustedTargets ?? {
    dailyCalorieTarget: n.dailyCalorieTarget,
    proteinG: n.protein.targetG,
    carbsG: n.carbs.targetG,
    fatG: n.fat.targetG,
  };
  const status = planStatus(n.plannedKcal, target.dailyCalorieTarget);
  const calories = progressOf(n.eatenKcal, target.dailyCalorieTarget);

  const statusStyle = {
    over: { bg: 'bg-red-100', text: 'text-red-700' },
    under: { bg: 'bg-amber-100', text: 'text-amber-700' },
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
            className={cn('text-[12px] font-bold uppercase', statusStyle.text)}
          >
            {PLAN_STATUS_LABEL[status]}
          </Text>
        </View>
      </View>

      {n.trainingDay ? <TrainingDayNote t={n.trainingDay} /> : null}

      {/* Calorie ring — stacked above the macros, like web's phone layout. */}
      <View className="mb-4 items-center gap-2">
        <ProgressRing
          testID="calorie-ring"
          accessibilityLabel={`${n.eatenKcal.toLocaleString('en-US')} of ${target.dailyCalorieTarget.toLocaleString('en-US')} kcal eaten today`}
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
          <Text className="text-[12px] text-gray-500">
            of {target.dailyCalorieTarget.toLocaleString('en-US')} kcal eaten
          </Text>
        </ProgressRing>
        <Text testID="calorie-remaining" className="text-center text-xs text-gray-500">
          {dayNutritionCaption(n.eatenKcal, n.plannedKcal, target.dailyCalorieTarget)}
        </Text>
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
