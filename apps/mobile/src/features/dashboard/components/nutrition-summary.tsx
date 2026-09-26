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
import { cn } from '@chefer/utils';
import type { RouterOutputs } from '../../../lib/trpc';

// Port of apps/web/src/features/dashboard/components/nutrition-summary.tsx.
// The calorie ring matches web's (128pt, 12pt stroke, brand brown) and adds
// the MO-06 motion: it animates to the planned total with a count-up in the
// centre, and past 100% of the target the ring and the macro bars turn amber
// with an overflow lap / end cap (owner decision 3, 2026-09-25).

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

const RING_SIZE = 128;
const RING_STROKE = 12;

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
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
        accessibilityLabel={`${label} ${value} of ${target} grams`}
        progress={progress}
        overColor={colors.warning}
      />
    </View>
  );
}

export function NutritionSummary({ nutrition: n }: { nutrition: Nutrition }) {
  // Three-state honesty (web review P-2): an under-planned day is not "on
  // track", and an empty day is unplanned rather than "under target".
  const ratio = n.plannedKcal / (n.dailyCalorieTarget || 1);
  const targetStatus =
    n.plannedKcal === 0 ? 'none' : ratio > 1.05 ? 'over' : ratio < 0.85 ? 'under' : 'on';
  const remaining = Math.max(n.dailyCalorieTarget - n.plannedKcal, 0);
  const calories = progressOf(n.plannedKcal, n.dailyCalorieTarget);

  const statusStyle = {
    over: { bg: 'bg-red-100', text: 'text-red-700', label: 'Over Target' },
    under: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Under Target' },
    on: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'On Track' },
    none: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'No Meals Planned' },
  }[targetStatus];

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Planned Today
        </Text>
        <View className={cn('rounded-full px-2.5 py-0.5', statusStyle.bg)}>
          <Text
            testID="nutrition-status"
            className={cn('text-[12px] font-bold uppercase', statusStyle.text)}
          >
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Calorie ring — stacked above the macros, like web's phone layout. */}
      <View className="mb-4 items-center gap-2">
        <ProgressRing
          testID="calorie-ring"
          accessibilityLabel={`${n.plannedKcal.toLocaleString()} of ${n.dailyCalorieTarget.toLocaleString()} kcal planned`}
          progress={calories}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          overColor={colors.warning}
        >
          <CountUp
            testID="calorie-count"
            value={n.plannedKcal}
            className="text-xl font-bold text-gray-900"
          />
          <Text className="text-[12px] text-gray-500">
            of {n.dailyCalorieTarget.toLocaleString()} kcal
          </Text>
        </ProgressRing>
        <Text testID="calorie-remaining" className="text-center text-xs text-gray-500">
          {remaining.toLocaleString()} remaining
        </Text>
      </View>

      {/* Macro bars */}
      <View className="gap-3">
        <MacroBar label="Protein" value={n.protein.planned} target={n.protein.targetG} />
        <MacroBar label="Carbs" value={n.carbs.planned} target={n.carbs.targetG} />
        <MacroBar label="Fat" value={n.fat.planned} target={n.fat.targetG} />
      </View>
    </Card>
  );
}
