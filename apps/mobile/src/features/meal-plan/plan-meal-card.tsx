import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { formatPortion, slotPortion } from '@chefer/utils';
import { AiGeneratedChip } from '../../components/ai-generated-chip';
import type { RouterOutputs } from '../../lib/trpc';
import { NutritionStatusTag } from '../ingredients/nutrition-provenance';
import { AllergenWarningChip } from '../recipes/allergen-warning';
import { CheckedForChip } from '../safety/checked-for-chip';
import { MealCardView } from './meal-card-view';

type PlanMeal = RouterOutputs['mealPlan']['getById']['days'][number]['meals'][number];

/**
 * One planned meal (the owner's view, wrapping the presentational
 * `MealCardView`): photo, type badge, name, time and kcal; tapping opens the
 * recipe. Shared by the Plan tab and the read-only history plan detail.
 * `trailing` is an optional action column on the right (the Plan tab's swap).
 * `day` (Plan tab only) is forwarded with the meal type so recipe detail can
 * offer the star rating, matching web's `?day=` gate.
 */
export function PlanMealCard({
  meal,
  testID,
  trailing,
  day,
  onReport,
}: {
  meal: PlanMeal;
  testID: string;
  trailing?: ReactNode;
  day?: number;
  /** L-SAFE2/T-01.5: long-press "Report a safety problem" (mirrors the recipe
   * detail overflow action) without leaving the plan card. */
  onReport?: (recipeId: string, recipeName: string) => void;
}) {
  // P1-1: the slot may be sized to the day's targets (1½× the recipe).
  const portion = slotPortion(meal.portion);
  const portionParam = portion !== 1 ? { portion: String(portion) } : {};
  const conflicts = meal.recipe.safetyChecks?.conflicts ?? [];
  const checked = meal.recipe.safetyChecks?.checked ?? [];
  return (
    <MealCardView
      testID={testID}
      mealType={meal.type}
      name={meal.recipe.name}
      imageUrl={meal.recipe.imageUrl}
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
          {meal.leftoverOf && (
            <View className="rounded-full bg-gray-100 px-2 py-0.5">
              <Text className="text-xs uppercase text-gray-500">Leftovers · {meal.leftoverOf}</Text>
            </View>
          )}
          {/* T-07.4/UX-07 §2: a meal the user chose (Replace, own recipe or
              `Keep`) shows a pin glyph + "Your pick" — it survives
              Regenerate by default (UX-08 §3). */}
          {meal.pinned && (
            <View
              testID={`${testID}-pinned`}
              className="flex-row items-center gap-1 rounded-full bg-accent px-2 py-0.5"
            >
              <Ionicons name="bookmark" size={10} color="#944a00" />
              <Text className="text-xs font-semibold text-primary">Your pick</Text>
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
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-gray-500">
            {meal.recipe.prepTimeMins + meal.recipe.cookTimeMins}m
          </Text>
          <Text className="text-xs text-gray-500">
            {Math.round(meal.recipe.nutritionInfo.calories * portion)} kcal
          </Text>
          <NutritionStatusTag status={meal.recipe.nutritionStatus} />
        </View>
      }
      trailing={trailing}
    >
      <AiGeneratedChip recipe={meal.recipe} />
      <AllergenWarningChip warnings={meal.recipe.allergenWarnings} />
      {/* T-02.4/AC3: a recipe that fails the table's rules never claims
          "Checked" — a conflict pill takes the Checked chip's place. */}
      {conflicts.length > 0 ? (
        <View
          testID={`${testID}-conflict`}
          accessibilityLabel={`Contains ${conflicts.join(', ')}`}
          className="flex-row items-center gap-1 self-start rounded-full bg-red-100 px-2 py-0.5"
        >
          <Ionicons name="warning" size={12} color="#991b1b" />
          <Text numberOfLines={1} className="text-xs font-semibold text-red-800">
            Contains {conflicts[0]}
          </Text>
        </View>
      ) : (
        <CheckedForChip testID={`${testID}-checked`} labels={checked.map((c) => c.label)} />
      )}
    </MealCardView>
  );
}
