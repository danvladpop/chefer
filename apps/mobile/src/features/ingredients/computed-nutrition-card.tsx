import { Pressable, View } from 'react-native';
import { CountUp, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { ingredientsCopy } from './copy';
import type { ComputedNutritionResult } from './use-computed-nutrition';

export interface ComputedNutritionCardProps {
  computed: ComputedNutritionResult | undefined;
  isComputing: boolean;
  hasIngredients: boolean;
  online: boolean;
  onEditNumbers: () => void;
  testID?: string;
}

/** The coverage line under the four stats — pure so it's unit-testable without rendering. */
export function computedNutritionCoverageLine(args: {
  computed: ComputedNutritionResult | undefined;
  hasIngredients: boolean;
  online: boolean;
}): string {
  const { computed, hasIngredients, online } = args;
  if (!hasIngredients) return ingredientsCopy.nutrition.addIngredients;
  if (!online && computed) return ingredientsCopy.nutrition.offline;
  if (!computed) return ingredientsCopy.nutrition.computing;
  if (computed.unmatched.length > 0) {
    return ingredientsCopy.nutrition.someUnmatched(
      computed.matchedCount,
      computed.totalCount,
      computed.unmatched,
    );
  }
  return ingredientsCopy.nutrition.allMatched(computed.totalCount);
}

/**
 * T-40.9 (UX-40 slice 2): the "Nutrition per serving — Calculated" card. Four
 * `CountUp` stats (MO-06) that tween when the computed numbers change; while
 * a NEW computation is in flight the old numbers stay, dimmed, instead of a
 * spinner ("shimmer" per the spec — this kit has no shimmer primitive, so a
 * plain opacity dip stands in for it). `Edit numbers` hands off to the
 * manual fields, prefilled from these values by the caller.
 */
export function ComputedNutritionCard({
  computed,
  isComputing,
  hasIngredients,
  online,
  onEditNumbers,
  testID = 'rf-nutrition-computed',
}: ComputedNutritionCardProps) {
  const stats = computed?.perServing;
  const coverage = computedNutritionCoverageLine({ computed, hasIngredients, online });

  return (
    <View testID={testID} className="gap-2 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label">Nutrition per serving</Text>
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
          {ingredientsCopy.nutrition.eyebrow}
        </Text>
      </View>
      <View
        className={cn('flex-row flex-wrap gap-x-4 gap-y-1', isComputing && 'opacity-50')}
        accessibilityLiveRegion="polite"
      >
        <Stat
          testID={`${testID}-kcal`}
          label="Calories"
          value={stats?.calories ?? 0}
          suffix=" kcal"
        />
        <Stat
          testID={`${testID}-protein`}
          label="Protein"
          value={stats?.protein ?? 0}
          suffix=" g"
        />
        <Stat testID={`${testID}-carbs`} label="Carbs" value={stats?.carbs ?? 0} suffix=" g" />
        <Stat testID={`${testID}-fat`} label="Fat" value={stats?.fat ?? 0} suffix=" g" />
      </View>
      <Text testID={`${testID}-coverage`} variant="muted" className="text-xs">
        {coverage}
      </Text>
      <Pressable
        testID={`${testID}-edit`}
        accessibilityRole="button"
        onPress={onEditNumbers}
        className="min-h-11 justify-center self-start"
      >
        <Text className="text-sm font-medium text-primary">
          {ingredientsCopy.nutrition.editNumbers}
        </Text>
      </Pressable>
    </View>
  );
}

function Stat({
  testID,
  label,
  value,
  suffix,
}: {
  testID: string;
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <View className="min-w-[70px] gap-0.5">
      <Text variant="muted" className="text-xs">
        {label}
      </Text>
      <View className="flex-row items-baseline">
        <CountUp
          testID={testID}
          value={value}
          className="text-base font-semibold text-foreground"
        />
        <Text className="text-xs text-muted-foreground">{suffix}</Text>
      </View>
    </View>
  );
}
