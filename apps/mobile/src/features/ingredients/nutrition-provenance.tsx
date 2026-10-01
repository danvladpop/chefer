import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { duration } from '@chefer/tokens';
import {
  INGREDIENT_CATALOG_COPY,
  NUTRITION_SOURCE_LABELS,
  type NutritionStatus,
} from '@chefer/types';
import { PressableScale, Text, timing, useReducedMotion } from '@chefer/ui-mobile';
import { cn, formatFractionalQuantity } from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';

const copy = INGREDIENT_CATALOG_COPY.status;

export type NutritionLineRow = NonNullable<
  RouterOutputs['mealPlan']['getRecipe']['nutritionLines']
>[number];

/** Lines that count toward the totals but have no grams — the "N need data" figure. */
export function incompleteNutritionLines(lines: readonly NutritionLineRow[]): number {
  return lines.filter((l) => !l.optional && l.grams === null).length;
}

/** The one-line provenance text for a stored recipe, or null when the API sent no status. */
export function provenanceText(
  status: NutritionStatus | null,
  lines: readonly NutritionLineRow[],
  ingredientCount: number,
): string | null {
  if (status === 'USER_ENTERED') return copy.userEntered;
  if (status === 'PARTIAL') return copy.incomplete(Math.max(1, incompleteNutritionLines(lines)));
  if (status === 'COMPUTED') {
    const counted = lines.length > 0 ? lines.filter((l) => !l.optional).length : ingredientCount;
    return copy.computedFrom(counted);
  }
  return null;
}

/** Compact badge text for cards and pickers: only the two statuses that need a caveat. */
export function nutritionStatusBadge(status: unknown): string | null {
  if (status === 'PARTIAL') return copy.incompleteBadge;
  if (status === 'USER_ENTERED') return copy.userEnteredBadge;
  return null;
}

export interface NutritionProvenanceProps {
  status: NutritionStatus | null;
  lines: readonly NutritionLineRow[];
  /** `recipe.ingredients.length`, for a COMPUTED recipe whose lines weren't sent. */
  ingredientCount: number;
  servings: number;
  /** The viewer owns the recipe: PARTIAL offers the editor. */
  onFix?: (() => void) | undefined;
  testID?: string;
}

/**
 * Recipe-detail proof that the numbers are computed (plan-ingredient-catalog
 * §10): "Computed from N ingredients", expandable into the per-line
 * breakdown (grams, kcal, protein — whole recipe) from `mealPlan.getRecipe`
 * `nutritionLines`. PARTIAL reads "Incomplete — N ingredients need data"
 * with a fix link for the owner; USER_ENTERED reads "Entered by you". A line
 * on someone else's private ingredient shows its grams but never a name or
 * numbers (I4: the API sends `facts: null`).
 *
 * MO-05 expand/collapse: the container re-lays out over `base`, rows fade in
 * and out, the chevron flips; instant under reduced motion.
 */
export function NutritionProvenance({
  status,
  lines,
  ingredientCount,
  servings,
  onFix,
  testID = 'recipe-nutrition-provenance',
}: NutritionProvenanceProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const layoutMs = reducedMotion ? 0 : duration.base;
  const fadeMs = reducedMotion ? 0 : duration.fast;

  const text = provenanceText(status, lines, ingredientCount);
  if (!text) return null;
  const partial = status === 'PARTIAL';
  const canExpand = status !== 'USER_ENTERED' && lines.length > 0;

  return (
    <Animated.View
      testID={testID}
      layout={LinearTransition.duration(layoutMs)}
      className="mt-3 gap-2 border-t border-border pt-3"
    >
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Ionicons
            name={
              partial
                ? 'alert-circle-outline'
                : status === 'USER_ENTERED'
                  ? 'create-outline'
                  : 'calculator-outline'
            }
            size={14}
            color={partial ? '#b45309' : '#6b7280'}
            accessibilityElementsHidden
          />
          <Text
            testID={`${testID}-text`}
            className={cn('min-w-0 flex-1 text-xs', partial ? 'text-amber-800' : 'text-gray-600')}
          >
            {text}
          </Text>
        </View>
        {partial && onFix ? (
          <PressableScale
            testID={`${testID}-fix`}
            pressScale="control"
            accessibilityRole="link"
            onPress={onFix}
            className="min-h-11 justify-center"
          >
            <Text className="text-xs font-semibold text-primary">{copy.fix}</Text>
          </PressableScale>
        ) : null}
      </View>

      {canExpand ? (
        <PressableScale
          testID={`${testID}-toggle`}
          pressScale="control"
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          className="min-h-11 flex-row items-center gap-1 self-start"
        >
          <Chevron open={open} reducedMotion={reducedMotion} />
          <Text className="text-xs font-medium text-primary">
            {open ? copy.hideBreakdown : copy.showBreakdown}
          </Text>
        </PressableScale>
      ) : null}

      {canExpand && open ? (
        <Animated.View
          testID={`${testID}-lines`}
          entering={FadeIn.duration(fadeMs)}
          exiting={FadeOut.duration(fadeMs)}
          className="gap-1.5"
        >
          <Text variant="muted" className="text-xs">
            {`Whole recipe · ${formatFractionalQuantity(servings)} serving${servings === 1 ? '' : 's'}`}
          </Text>
          {lines.map((line) => (
            <BreakdownRow
              key={line.position}
              line={line}
              testID={`${testID}-line-${line.position}`}
            />
          ))}
          <Text variant="muted" className="text-xs">
            {copy.caveat}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** MO-05: the chevron flips 180° over `fast`; under reduced motion the icon swaps instead. */
function Chevron({ open, reducedMotion }: { open: boolean; reducedMotion: boolean }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = reducedMotion ? 0 : withTiming(open ? 180 : 0, timing(duration.fast));
  }, [open, reducedMotion, rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons
        name={reducedMotion && open ? 'chevron-up' : 'chevron-down'}
        size={14}
        color="#944a00"
      />
    </Animated.View>
  );
}

function BreakdownRow({ line, testID }: { line: NutritionLineRow; testID: string }) {
  const name = line.ingredientName ?? (line.ingredientId ? copy.notVisible : line.rawName);
  const missing = line.grams === null;
  const amount = `${formatFractionalQuantity(line.quantity)} ${line.unit}`.trim();
  const source = line.nutritionSource ? NUTRITION_SOURCE_LABELS[line.nutritionSource] : null;
  const numbers = line.facts
    ? `${Math.round(line.facts.calories)} kcal · ${Math.round(line.facts.protein * 10) / 10} g protein`
    : null;

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={[
        name,
        amount,
        line.grams !== null ? `${Math.round(line.grams)} g` : copy.needsData,
        numbers,
      ]
        .filter(Boolean)
        .join(', ')}
      className="flex-row items-start gap-2"
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className="text-sm text-gray-800">
          {name}
        </Text>
        <Text className="text-xs text-gray-500">
          {[amount, line.grams !== null ? `${Math.round(line.grams)} g` : null, source]
            .filter(Boolean)
            .join(' · ')}
          {line.optional ? ` · ${copy.optional}` : ''}
        </Text>
      </View>
      <Text
        className={cn(
          'shrink-0 text-right text-xs',
          missing && !line.optional ? 'font-medium text-amber-700' : 'text-gray-700',
        )}
      >
        {missing ? copy.needsData : (numbers ?? '')}
      </Text>
    </View>
  );
}

/**
 * The caveat next to a kcal figure on cards and pickers: "Incomplete" (PARTIAL,
 * amber) or "Entered by you" (USER_ENTERED, muted). Nothing for COMPUTED, or
 * for an API that sends no status.
 */
export function NutritionStatusTag({ status, testID }: { status: unknown; testID?: string }) {
  const badge = nutritionStatusBadge(status);
  if (!badge) return null;
  return (
    <Text
      testID={testID}
      className={cn('text-xs', status === 'PARTIAL' ? 'text-amber-700' : 'text-gray-500')}
    >
      {`· ${badge}`}
    </Text>
  );
}
