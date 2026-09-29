import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { formatPortion, slotPortion } from '@chefer/utils';
import { AiGeneratedChip } from '../../components/ai-generated-chip';
import { getRecipeImageUrl } from '../../lib/recipe-image';
import type { RouterOutputs } from '../../lib/trpc';
import { MealTypeBadge } from '../dashboard/components/meal-type-badge';
import { AllergenWarningChip } from '../recipes/allergen-warning';
import { CheckedForChip } from '../safety/checked-for-chip';

type PlanMeal = RouterOutputs['mealPlan']['getById']['days'][number]['meals'][number];

/**
 * One planned meal: photo, type badge, name, time and kcal; tapping opens the
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
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/recipe/[id]',
          params:
            day === undefined
              ? { id: meal.recipe.id, ...portionParam }
              : { id: meal.recipe.id, day: String(day), meal: meal.type, ...portionParam },
        })
      }
      onLongPress={onReport ? () => onReport(meal.recipe.id, meal.recipe.name) : undefined}
      className="flex-row overflow-hidden rounded-2xl border border-border bg-card"
    >
      <Image
        source={{ uri: getRecipeImageUrl(meal.recipe.imageUrl) }}
        className="h-28 w-24"
        resizeMode="cover"
      />
      <View className="min-w-0 flex-1 justify-between p-3">
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <MealTypeBadge mealType={meal.type} />
            {meal.leftoverOf && (
              <View className="rounded-full bg-gray-100 px-2 py-0.5">
                <Text className="text-xs uppercase text-gray-500">
                  Leftovers · {meal.leftoverOf}
                </Text>
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
          </View>
          <Text numberOfLines={2} className="text-sm font-semibold text-gray-900">
            {meal.recipe.name}
          </Text>
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
        </View>
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-gray-500">
            {meal.recipe.prepTimeMins + meal.recipe.cookTimeMins}m
          </Text>
          <Text className="text-xs text-gray-500">
            {Math.round(meal.recipe.nutritionInfo.calories * portion)} kcal
          </Text>
        </View>
      </View>
      {trailing}
    </Pressable>
  );
}
