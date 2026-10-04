import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, Text } from '@chefer/ui-mobile';
import { formatKcal, sumPlanDay } from '@chefer/utils';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// Day totals for the Plan tab — port of web's DayRecapBar. Each slot counts at
// its portion (P1-1), the calorie status uses the same ±15% band as web, and a
// protein-short day says so honestly (DayPlanDto.proteinGapG) instead of
// passing as on target. T-11.3: the status is neutral and tappable — it opens
// the PlanMissSheet (Bigger portions / Add a snack / Keep it) rather than
// shouting in amber or red on first render.

/** Matches the API's PLAN_KCAL_TOLERANCE and web's DayRecapBar. */
const TARGET_BAND = 0.15;

type Meal = Parameters<typeof sumPlanDay>[0][number];

/** The neutral one-line status for a day outside the band or short on protein, or null. */
export function planDayStatus(input: {
  kcal: number;
  calorieTarget?: number | undefined;
  proteinGapG?: number | undefined;
}): string | null {
  const { kcal, calorieTarget, proteinGapG } = input;
  if (calorieTarget) {
    const delta = kcal - calorieTarget;
    if (Math.abs(delta) / calorieTarget > TARGET_BAND) {
      return delta < 0
        ? `About ${formatKcal(Math.abs(delta))} kcal under this day’s target`
        : `About ${formatKcal(delta)} kcal over this day’s target`;
    }
  }
  if (proteinGapG !== undefined && proteinGapG > 0) {
    return `About ${proteinGapG} g short on protein`;
  }
  return null;
}

export function PlanDayTotals({
  meals,
  calorieTarget,
  proteinGapG,
  onOpenStatus,
  testID = 'plan-day-totals',
}: {
  meals: Meal[];
  calorieTarget?: number | undefined;
  proteinGapG?: number | undefined;
  /** Opens the PlanMissSheet; without it the status is plain text. */
  onOpenStatus?: (() => void) | undefined;
  testID?: string;
}) {
  // WP-08: protein-only mode shows the day's protein and only a protein shortfall.
  const { proteinOnly } = useNumbersMode();
  const totals = sumPlanDay(meals);
  const status = planDayStatus({
    kcal: totals.kcal,
    calorieTarget: proteinOnly ? undefined : calorieTarget,
    proteinGapG,
  });

  return (
    <View testID={testID} className="gap-1 rounded-xl bg-gray-50 px-3 py-2">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text className="text-xs font-semibold uppercase text-gray-500">Day total</Text>
        {proteinOnly ? (
          <Text testID={`${testID}-protein`} className="text-sm font-bold text-primary">
            {totals.protein} g protein
          </Text>
        ) : (
          <>
            <Text testID={`${testID}-kcal`} className="text-sm font-bold text-primary">
              {formatKcal(totals.kcal)} kcal
            </Text>
            <Text className="text-xs text-gray-500">
              P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g
            </Text>
          </>
        )}
      </View>
      {status !== null &&
        (onOpenStatus ? (
          <Pressable
            testID={`${testID}-status`}
            accessibilityRole="button"
            accessibilityLabel={`${status}. See options`}
            onPress={onOpenStatus}
            className="min-h-11 flex-row items-center gap-1.5"
          >
            <Text className="min-w-0 flex-shrink text-xs text-gray-600">{status}</Text>
            <Text className="text-xs font-semibold text-primary">See options</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </Pressable>
        ) : (
          <Text testID={`${testID}-status`} className="text-xs text-gray-600">
            {status}
          </Text>
        ))}
    </View>
  );
}
