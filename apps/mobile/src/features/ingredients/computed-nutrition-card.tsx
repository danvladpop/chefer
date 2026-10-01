import { View } from 'react-native';
import { INGREDIENT_CATALOG_COPY } from '@chefer/types';
import { CountUp, Text } from '@chefer/ui-mobile';
import { cn, incompleteLineCount, type RecipeNutritionResult } from '@chefer/utils';
import { ingredientsCopy } from './copy';

export interface ComputedNutritionCardProps {
  result: RecipeNutritionResult | undefined;
  isComputing: boolean;
  hasIngredients: boolean;
  online: boolean;
  /** The recipe being edited was saved with typed numbers (USER_ENTERED). */
  wasUserEntered?: boolean;
  testID?: string;
}

/** The coverage line under the four stats — pure so it's unit-testable without rendering. */
export function computedNutritionCoverageLine(args: {
  result: RecipeNutritionResult | undefined;
  hasIngredients: boolean;
  online: boolean;
  isComputing?: boolean;
}): string {
  const { result, hasIngredients, online, isComputing = false } = args;
  if (!hasIngredients || !result) return ingredientsCopy.nutrition.addIngredients;
  if (isComputing) return ingredientsCopy.nutrition.computing;
  if (result.status === 'PARTIAL') {
    const incomplete = INGREDIENT_CATALOG_COPY.status.incomplete(incompleteLineCount(result));
    return online ? incomplete : `${incomplete}. ${ingredientsCopy.nutrition.offline}`;
  }
  const counted = result.lines.filter((l) => !l.optional).length;
  return INGREDIENT_CATALOG_COPY.status.computedFrom(counted);
}

/**
 * The "Nutrition per serving — Calculated" card (plan-ingredient-catalog §10).
 * The numbers are the shared engine's, the same the server will store, so
 * there is no manual path any more: the server ignores typed numbers once
 * every line is linked. Four `CountUp` stats (MO-06) tween when the numbers
 * change; while a newly linked row loads the old numbers stay, dimmed.
 * PARTIAL says how many lines still need data instead of passing an
 * undercount off as the recipe's nutrition.
 */
export function ComputedNutritionCard({
  result,
  isComputing,
  hasIngredients,
  online,
  wasUserEntered = false,
  testID = 'rf-nutrition-computed',
}: ComputedNutritionCardProps) {
  const stats = result?.perServing;
  const partial = result?.status === 'PARTIAL' && !isComputing;
  const coverage = computedNutritionCoverageLine({ result, hasIngredients, online, isComputing });

  return (
    <View testID={testID} className="gap-2 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label">Nutrition per serving</Text>
        <Text
          testID={`${testID}-status`}
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            partial ? 'text-amber-700' : 'text-primary',
          )}
        >
          {partial
            ? INGREDIENT_CATALOG_COPY.status.incompleteBadge
            : ingredientsCopy.nutrition.eyebrow}
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
      <Text
        testID={`${testID}-coverage`}
        className={cn('text-xs', partial ? 'text-amber-800' : 'text-muted-foreground')}
      >
        {coverage}
      </Text>
      {wasUserEntered ? (
        <Text testID={`${testID}-was-user-entered`} variant="muted" className="text-xs">
          {INGREDIENT_CATALOG_COPY.status.userEnteredOnEdit}
        </Text>
      ) : null}
      <Text variant="muted" className="text-xs">
        {INGREDIENT_CATALOG_COPY.status.caveat}
      </Text>
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
