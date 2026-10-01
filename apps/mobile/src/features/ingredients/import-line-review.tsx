import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { duration } from '@chefer/tokens';
import { INGREDIENT_CATALOG_COPY } from '@chefer/types';
import { Card, haptics, PressableScale, Text, useReducedMotion } from '@chefer/ui-mobile';
import { formatFractionalQuantity, type RecipeNutritionResult } from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';
import { pickedFromRef, type CatalogRef, type PickedIngredient } from './catalog-line';
import { IngredientPickerField } from './ingredient-picker-field';

const copy = INGREDIENT_CATALOG_COPY.importReview;

export type ImportLineResolution =
  RouterOutputs['recipe']['importPreview']['resolution']['original'][number];

export interface ImportLine {
  name: string;
  quantity: number;
  unit: string;
}

/** The catalog row each line is saved with: the user's pick, else the resolver's EXACT/ALIAS match. */
export function effectiveIngredientIds(
  lines: readonly ImportLine[],
  resolution: readonly (ImportLineResolution | undefined)[],
  picks: Readonly<Record<number, PickedIngredient>>,
): (string | null)[] {
  return lines.map((_, i) => picks[i]?.id ?? resolution[i]?.match?.id ?? null);
}

/**
 * Lines the review must show: unmatched, or matched with a unit the row can't
 * weigh (server `problem`), or anything the live computation still flags.
 * Picked lines stay listed (as "Matched to …") so a pick can be changed.
 */
export function linesToReview(
  lines: readonly ImportLine[],
  resolution: readonly (ImportLineResolution | undefined)[],
  picks: Readonly<Record<number, PickedIngredient>>,
  result: RecipeNutritionResult | undefined,
): number[] {
  return lines.flatMap((_, i) => {
    const r = resolution[i];
    const serverFlag = !r?.match || r.problem !== undefined;
    const live = result?.lines.at(i);
    const liveFlag = live?.problem !== undefined && !live.optional;
    return picks[i] || serverFlag || liveFlag ? [i] : [];
  });
}

export interface ImportLineReviewProps {
  lines: readonly ImportLine[];
  resolution: readonly (ImportLineResolution | undefined)[];
  picks: Readonly<Record<number, PickedIngredient>>;
  onPick: (index: number, ingredient: PickedIngredient) => void;
  /** Live engine result over the effective ids (problems per line, same order). */
  result: RecipeNutritionResult | undefined;
  testID?: string;
}

/**
 * Import review (plan-ingredient-catalog §6.2, §10): each line the resolver
 * couldn't match is listed with its fuzzy candidates — never applied without
 * the user — plus the full catalog search and "Create … as my ingredient".
 * A matched line whose unit the row can't weigh explains why it stays
 * incomplete. Used by the link/text import and the video draft review.
 *
 * MO-04: rows enter with a short fade; the list re-lays out over `base` as
 * lines resolve (instant under reduced motion).
 */
export function ImportLineReview({
  lines,
  resolution,
  picks,
  onPick,
  result,
  testID = 'import-review',
}: ImportLineReviewProps) {
  const reducedMotion = useReducedMotion();
  const layoutMs = reducedMotion ? 0 : duration.base;
  const indexes = linesToReview(lines, resolution, picks, result);
  const open = indexes.filter((i) => !picks[i] || result?.lines.at(i)?.problem !== undefined);

  if (indexes.length === 0) {
    return (
      <View testID={`${testID}-all-matched`} className="flex-row items-center gap-1.5">
        <Ionicons name="checkmark-circle" size={14} color="#15803d" accessibilityElementsHidden />
        <Text variant="muted" className="min-w-0 flex-1 text-xs">
          {copy.allMatched}
        </Text>
      </View>
    );
  }

  return (
    <Card testID={testID} className="gap-3">
      <View className="gap-1">
        <Text variant="heading">{copy.title}</Text>
        {open.length > 0 ? (
          <Text variant="muted" className="text-xs">
            {copy.body}
          </Text>
        ) : (
          <Text variant="muted" className="text-xs">
            {copy.allMatched}
          </Text>
        )}
      </View>
      <Animated.View layout={LinearTransition.duration(layoutMs)} className="gap-3">
        {indexes
          .flatMap((i) => {
            const line = lines.at(i);
            return line ? [{ i, line }] : [];
          })
          .map(({ i, line }) => (
            <Animated.View
              key={i}
              entering={reducedMotion ? undefined : FadeIn.duration(duration.base)}
            >
              <ReviewRow
                index={i}
                line={line}
                resolution={resolution[i]}
                picked={picks[i]}
                liveProblem={result?.lines.at(i)?.problem}
                onPick={(ingredient) => onPick(i, ingredient)}
                testID={`${testID}-line-${i}`}
              />
            </Animated.View>
          ))}
      </Animated.View>
    </Card>
  );
}

function ReviewRow({
  index,
  line,
  resolution,
  picked,
  liveProblem,
  onPick,
  testID,
}: {
  index: number;
  line: ImportLine;
  resolution: ImportLineResolution | undefined;
  picked: PickedIngredient | undefined;
  liveProblem: string | undefined;
  onPick: (ingredient: PickedIngredient) => void;
  testID: string;
}) {
  const amount = `${formatFractionalQuantity(line.quantity)} ${line.unit}`.trim();
  const matchedName = picked?.name ?? resolution?.match?.name;
  const unitProblem =
    matchedName && (liveProblem ?? resolution?.problem) !== undefined
      ? copy.unitProblem(line.unit)
      : null;
  const candidates: readonly CatalogRef[] = resolution?.candidates ?? [];

  return (
    <View testID={testID} className="gap-1.5">
      <Text className="text-sm text-gray-800">
        <Text className="font-semibold">{amount}</Text> {line.name}
      </Text>
      {picked ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={14} color="#15803d" accessibilityElementsHidden />
          <Text testID={`${testID}-matched`} className="min-w-0 flex-1 text-xs text-gray-700">
            {copy.matchedTo(picked.name)}
          </Text>
        </View>
      ) : null}
      {unitProblem ? <Text className="text-xs text-amber-800">{unitProblem}</Text> : null}
      {!picked && candidates.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {candidates.slice(0, 3).map((c) => (
            // MO-01 press feedback on each suggestion.
            <PressableScale
              key={c.id}
              pressScale="control"
              testID={`${testID}-candidate-${c.slug}`}
              accessibilityRole="button"
              accessibilityLabel={`${INGREDIENT_CATALOG_COPY.picker.pickMatch}: ${c.name}`}
              onPress={() => {
                haptics.selection();
                onPick(pickedFromRef(c));
              }}
              className="min-h-11 justify-center rounded-full border border-amber-300 bg-amber-50 px-3"
            >
              <Text numberOfLines={1} className="text-xs font-medium text-amber-900">
                {c.name}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
      <IngredientPickerField
        testID={`${testID}-picker`}
        name={picked ? copy.change : INGREDIENT_CATALOG_COPY.picker.searchInstead}
        linked={false}
        needsMatch={!picked && !matchedName}
        searchText={line.name}
        suggestions={candidates}
        placeholder={INGREDIENT_CATALOG_COPY.picker.searchInstead}
        accessibilityLabel={`${INGREDIENT_CATALOG_COPY.picker.pickMatch} for ingredient ${index + 1}, ${line.name}`}
        onPick={onPick}
      />
    </View>
  );
}
