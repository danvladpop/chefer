import { View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import type { RouterOutputs } from '../../../lib/trpc';

// Port of apps/web/src/features/dashboard/components/nutrition-summary.tsx.
// Deviation: the SVG calorie ring becomes a headline number + bar (no SVG
// primitives in RN core; not worth a dependency for one ring).

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

/** Percentage of target, capped at 100 so the bar never overshoots. */
function pct(value: number, target: number): number {
  return Math.min(Math.round((value / (target || 1)) * 100), 100);
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <View>
      <View className="mb-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-xs font-medium text-gray-700">{label}</Text>
        <Text className="text-xs text-gray-500">
          {value}g / {target}g
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct(value, target)}%` }}
        />
      </View>
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

  const statusStyle = {
    over: { bg: 'bg-red-100', text: 'text-red-700', label: 'Over Target' },
    under: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Under Target' },
    on: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'On Track' },
    none: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'No Meals Planned' },
  }[targetStatus];

  return (
    <Card testID="nutrition-summary">
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Planned Today
        </Text>
        <View className={cn('rounded-full px-2.5 py-0.5', statusStyle.bg)}>
          <Text
            testID="nutrition-status"
            className={cn('text-[10px] font-bold uppercase', statusStyle.text)}
          >
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Calories */}
      <View className="mb-1 flex-row items-baseline gap-2">
        <Text className="text-2xl font-bold text-gray-900">{n.plannedKcal.toLocaleString()}</Text>
        <Text className="text-xs text-gray-500">
          of {n.dailyCalorieTarget.toLocaleString()} kcal · {remaining.toLocaleString()} remaining
        </Text>
      </View>
      <View className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct(n.plannedKcal, n.dailyCalorieTarget)}%` }}
        />
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
