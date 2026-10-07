import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import {
  conflictText,
  formatPortion,
  PLAN_MEAL_MENU_COPY,
  planMealMacroLine,
  planMealMetaLine,
  slotPortion,
  verifiedLabels,
} from '@chefer/utils';
import { AiGeneratedChip } from '../../components/ai-generated-chip';
import type { RouterOutputs } from '../../lib/trpc';
import { NutritionStatusTag } from '../ingredients/nutrition-provenance';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { AllergenWarningChip } from '../recipes/allergen-warning';
import { CheckedForChip } from '../safety/checked-for-chip';
import { MealCardView } from './meal-card-view';

type PlanMeal = RouterOutputs['mealPlan']['getById']['days'][number]['meals'][number];

/**
 * One planned meal (the owner's view, wrapping the presentational
 * `MealCardView`): photo, type badge, name, time and kcal; tapping opens the
 * recipe. Shared by the Plan tab and the read-only history plan detail.
 * `trailing` is an optional action column on the right (the Plan tab's swap
 * and "…", see `PlanMealActions`). FB7-11: the meta line reads "10 min · 687
 * kcal" with the AI mark reduced to a sparkle, and a macro line sits under it;
 * a pinned meal shows a bookmark on its photo instead of a text badge.
 * FB7-04: `side` renders a compact card for a second dish of the same meal
 * type, and `hideTypeBadge` drops the eyebrow inside a meal group.
 * `day` (Plan tab only) is forwarded with the meal type so recipe detail can
 * offer the star rating, matching web's `?day=` gate.
 */
export function PlanMealCard({
  meal,
  testID,
  trailing,
  day,
  onReport,
  eaten = false,
  slotNote,
  side = false,
  hideTypeBadge = false,
}: {
  meal: PlanMeal;
  testID: string;
  trailing?: ReactNode;
  day?: number;
  /** L-SAFE2/T-01.5: long-press "Report a safety problem" (mirrors the recipe
   * detail overflow action) without leaving the plan card. */
  onReport?: (recipeId: string, recipeName: string) => void;
  /** UX-PLAN-11: the past-week view marks a meal the user logged as eaten. */
  eaten?: boolean;
  /**
   * WP-06: what became of this slot when it was not eaten as planned — "You had:
   * …" (a replacement) or "Skipped", with its Remove / Undo. Shown under the name.
   */
  slotNote?: ReactNode;
  /** FB7-04: a side dish — compact, with a "+ side" badge. */
  side?: boolean;
  /** FB7-04: inside a meal group the header names the type once. */
  hideTypeBadge?: boolean;
}) {
  // WP-08: protein-only mode shows protein per meal instead of kcal (the plan still balances kcal).
  const { proteinOnly } = useNumbersMode();
  // P1-1: the slot may be sized to the day's targets (1½× the recipe).
  const portion = slotPortion(meal.portion);
  const portionParam = portion !== 1 ? { portion: String(portion) } : {};
  const conflicts = meal.recipe.safetyChecks?.conflicts ?? [];
  const conflictDetails = meal.recipe.safetyChecks?.conflictDetails;
  // UX-PLAN-06: a diet reads "Not paleo: contains quinoa", an allergen "Contains peanut".
  const conflictLabel = conflicts[0]
    ? conflictText(
        conflictDetails?.find((d) => d.label === conflicts[0]) ?? { label: conflicts[0] },
      )
    : '';
  const macroLine = planMealMacroLine(meal.recipe.nutritionInfo, portion, proteinOnly);
  const hasWarnings = (meal.recipe.allergenWarnings?.length ?? 0) > 0;
  return (
    <MealCardView
      testID={testID}
      mealType={meal.type}
      name={meal.recipe.name}
      imageUrl={meal.recipe.imageUrl}
      compact={side}
      hideTypeBadge={hideTypeBadge}
      imageBadge={
        meal.pinned ? (
          // T-07.4/UX-07 §2: a meal the user chose (Replace, own recipe or
          // `Keep`) survives Regenerate; FB7-11 shows that as a bookmark on
          // the photo instead of an always-visible button.
          <View
            testID={`${testID}-pinned`}
            accessible
            accessibilityRole="image"
            accessibilityLabel={PLAN_MEAL_MENU_COPY.pinnedBadge}
            className="h-6 w-6 items-center justify-center rounded-full bg-white/90"
          >
            <Ionicons name="bookmark" size={13} color="#944a00" />
          </View>
        ) : undefined
      }
      onPress={() =>
        router.push({
          pathname: '/recipe/[id]',
          params:
            day === undefined
              ? { id: meal.recipe.id, ...portionParam }
              : { id: meal.recipe.id, day: String(day), meal: meal.type, ...portionParam },
        })
      }
      {...(onReport ? { onLongPress: () => onReport(meal.recipe.id, meal.recipe.name) } : {})}
      badges={
        <>
          {eaten && (
            <View
              testID={`${testID}-eaten`}
              accessibilityLabel="Eaten"
              className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5"
            >
              <Ionicons name="checkmark-circle" size={12} color="#047857" />
              <Text className="text-xs font-semibold text-emerald-700">Eaten</Text>
            </View>
          )}
          {meal.leftoverOf && (
            <View className="rounded-full bg-gray-100 px-2 py-0.5">
              <Text className="text-xs uppercase text-gray-500">Leftovers · {meal.leftoverOf}</Text>
            </View>
          )}
          {side && (
            <View testID={`${testID}-side`} className="rounded-full bg-gray-100 px-2 py-0.5">
              <Text className="text-xs font-semibold text-gray-600">
                {PLAN_MEAL_MENU_COPY.sideBadge}
              </Text>
            </View>
          )}
          {portion !== 1 && (
            <View testID={`${testID}-portion`} className="rounded-full bg-accent px-2 py-0.5">
              <Text className="text-xs font-semibold text-primary">
                {formatPortion(portion)} portion
              </Text>
            </View>
          )}
        </>
      }
      meta={
        <View className="gap-0.5">
          <View className="min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            <AiGeneratedChip recipe={meal.recipe} variant="icon" />
            <Text testID={`${testID}-nutrition`} className="text-xs text-gray-500">
              {planMealMetaLine(
                meal.recipe.prepTimeMins + meal.recipe.cookTimeMins,
                meal.recipe.nutritionInfo,
                portion,
                proteinOnly,
              )}
            </Text>
            <NutritionStatusTag status={meal.recipe.nutritionStatus} />
          </View>
          {macroLine !== null && (
            <Text testID={`${testID}-macros`} numberOfLines={1} className="text-xs text-gray-500">
              {macroLine}
            </Text>
          )}
        </View>
      }
      trailing={trailing}
    >
      {slotNote}
      <AllergenWarningChip warnings={meal.recipe.allergenWarnings} details={conflictDetails} />
      {/* T-02.4/AC3: a recipe that fails the table's rules never claims
          "Checked" — a conflict pill takes the Checked chip's place. */}
      {conflicts.length > 0 && hasWarnings ? null : conflicts.length > 0 ? (
        <View
          testID={`${testID}-conflict`}
          accessibilityLabel={conflicts
            .map((label) =>
              conflictText(conflictDetails?.find((d) => d.label === label) ?? { label }),
            )
            .join(', ')}
          className="flex-row items-center gap-1 self-start rounded-full bg-red-100 px-2 py-0.5"
        >
          <Ionicons name="warning" size={12} color="#991b1b" />
          <Text numberOfLines={1} className="text-xs font-semibold text-red-800">
            {conflictLabel}
          </Text>
        </View>
      ) : (
        <CheckedForChip
          testID={`${testID}-checked`}
          labels={verifiedLabels(meal.recipe.safetyChecks)}
        />
      )}
    </MealCardView>
  );
}
