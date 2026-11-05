import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import {
  formatKcal,
  localDateStr,
  slotPortion,
  userFacingErrorMessage,
  verifiedLabels,
} from '@chefer/utils';
import { trackMealLogged } from '../../../lib/analytics-events';
import { useT } from '../../../lib/i18n';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { RecipeImage } from '../../recipes/recipe-image';
import { StarRating } from '../../recipes/star-rating';
import { CheckedForChip } from '../../safety/checked-for-chip';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from '../../tracker/rebalance-offer-store';
import { SlotOverflowButton, SlotStatusLine } from '../../tracker/slot-controls';
import { SLOT_COPY, youHadText } from '../../tracker/slot-copy';

// Tonight card (UX-04 §3, T-04.4) — evolves HeroMealCard for the 16:00–21:29
// band: today's DINNER specifically, never a breakfast. Collapses to a
// 56 pt done row after cook mode/logging (AC3); kcal and "I ate this" only
// for goal/tracking users (B-31, `showNutrition`).

/** 0 = Monday … 6 = Sunday, the Plan tab's day index. */
function mondayFirstDayIndex(now: Date = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

type Tonight = NonNullable<RouterOutputs['dashboard']['summary']['tonight']>;

/** WP-06: what became of tonight's dinner slot, from `dashboard.summary` `today.slots`. */
export type TonightSlot =
  | {
      status: 'replaced';
      name: string;
      kcal: number;
      protein?: number | undefined;
      onRemove?: (() => void) | undefined;
    }
  | { status: 'skipped'; onUndo: () => void };

export function TonightCard({
  meal,
  showNutrition,
  onLogged,
  slot,
  onSlotActions,
}: {
  meal: Tonight;
  showNutrition: boolean;
  onLogged: () => void;
  /** Set when the dinner was replaced ("You had: …") or skipped. */
  slot?: TonightSlot | undefined;
  /** WP-06: opens the dinner's actions — the overflow next to "I ate this". */
  onSlotActions?: (() => void) | undefined;
}) {
  const { t } = useT();
  const utils = trpc.useUtils();
  // WP-08: protein-only mode shows no kcal on the card.
  const { proteinOnly, noNumbers } = useNumbersMode();
  // UX-FOOD-04: "Rate it" opens the real StarRating (the one cook mode's
  // finish screen uses) inline; the link is gone once a rating exists.
  const [rateOpen, setRateOpen] = useState(false);
  const myRating = trpc.recipe.getMyRating.useQuery(
    { recipeId: meal.recipe.id },
    { enabled: meal.done },
  );
  const canRate = !myRating.isLoading && !myRating.data;
  const logMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result) => {
      trackMealLogged('planned', meal.mealType);
      recordRebalanceOutcome(result);
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      onLogged();
    },
  });

  // The slot's portion multiplier is already baked into recipe.kcal above;
  // logRecipe still wants its own 0.5–2× clamp, same default as HeroMealCard.
  const logPortion = Math.min(2, Math.max(0.5, slotPortion(undefined)));
  const openCookMode = () =>
    router.push({
      pathname: '/cook/[id]',
      params: { id: meal.recipe.id, meal: meal.mealType },
    });
  // UX-FOOD-18: Plan opens on NEXT week on Friday/Saturday evenings, which is
  // not tonight's dinner. Name this week and today's weekday explicitly, and
  // ask Plan to open the dinner's replace picker (`at` = a fresh link).
  const openSwap = () =>
    router.push({
      pathname: '/(food)/meal-plan',
      params: {
        week: '0',
        day: String(mondayFirstDayIndex()),
        swap: 'dinner',
        at: String(Date.now()),
      },
    });

  // WP-06: a skipped dinner is neither eaten nor left to cook; say so, with Undo.
  if (slot?.status === 'skipped') {
    return (
      <Card testID="tonight-card-skipped" className="py-1">
        <SlotStatusLine
          testID="tonight-skipped"
          text={t('today.home.tonight.dinnerLine', { status: SLOT_COPY.skippedLabel })}
          actionLabel={SLOT_COPY.undo}
          onAction={slot.onUndo}
        />
      </Card>
    );
  }

  if (meal.done) {
    // WP-06: the dinner was replaced — it reads what the user had, not the plan.
    if (slot?.status === 'replaced') {
      return (
        <Card testID="tonight-card-done" className="py-1">
          <SlotStatusLine
            testID="tonight-replaced"
            text={t('today.home.tonight.done', {
              name: youHadText(
                { custom: { name: slot.name }, kcal: slot.kcal, protein: slot.protein },
                proteinOnly,
                noNumbers,
              ),
            })}
            actionLabel={slot.onRemove ? SLOT_COPY.remove : undefined}
            onAction={slot.onRemove}
          />
        </Card>
      );
    }
    return (
      <Card testID="tonight-card-done" className="gap-2 py-3">
        <View className="flex-row items-center gap-2.5">
          <Text className="text-base">✓</Text>
          <Text className="min-w-0 flex-1 text-sm font-medium text-label" numberOfLines={1}>
            {t('today.home.tonight.done', { name: meal.recipe.name })}
          </Text>
          {canRate && !rateOpen && (
            <Pressable
              testID="tonight-rate-it"
              accessibilityRole="button"
              onPress={() => setRateOpen(true)}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-xs font-semibold text-primary">
                {t('today.home.tonight.rateIt')}
              </Text>
            </Pressable>
          )}
        </View>
        {rateOpen && (
          <StarRating
            recipeId={meal.recipe.id}
            title={t('today.home.tonight.rateTitle')}
            hint={t('today.home.tonight.rateHint')}
            className="border-0 p-0 shadow-none"
          />
        )}
      </Card>
    );
  }

  return (
    <Card testID="tonight-card" className="overflow-hidden p-0">
      <Pressable
        testID="tonight-card-open"
        accessibilityRole="button"
        accessibilityLabel={t('today.home.tonight.cardLabel', {
          name: meal.recipe.name,
          servings: String(meal.recipe.servings),
        })}
        onPress={() => router.push(`/recipe/${meal.recipe.id}`)}
        className="active:opacity-80"
      >
        <RecipeImage
          imageUrl={meal.recipe.imageUrl}
          className="h-40 w-full"
          accessibilityLabel={meal.recipe.name}
        />
        <View className="gap-2 px-4 pt-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="self-start rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-xs font-semibold uppercase text-primary-foreground">
                {t('today.home.tonight.badge')}
              </Text>
            </View>
            {verifiedLabels(meal.safetyChecks).length > 0 && (
              <CheckedForChip
                testID="tonight-checked-for"
                labels={verifiedLabels(meal.safetyChecks)}
              />
            )}
          </View>
          <Text className="text-lg font-bold leading-snug text-label">{meal.recipe.name}</Text>
          <Text className="text-xs text-label-tertiary">
            {showNutrition && !proteinOnly
              ? t('today.home.tonight.metaWith.kcal', {
                  minutes: String(meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0)),
                  servings: String(meal.recipe.servings),
                  value: formatKcal(meal.recipe.kcal),
                })
              : t('today.home.tonight.meta', {
                  minutes: String(meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0)),
                  servings: String(meal.recipe.servings),
                })}
          </Text>
        </View>
      </Pressable>

      <View className="flex-row gap-2 p-4">
        <Button testID="tonight-cook-it" className="flex-1" onPress={openCookMode}>
          {t('today.home.tonight.cookIt')}
        </Button>
        <Button testID="tonight-swap" variant="outline" className="flex-1" onPress={openSwap}>
          {t('today.home.tonight.swap')}
        </Button>
      </View>
      {showNutrition && (
        <View className="flex-row items-center border-t border-border">
          <Pressable
            testID="tonight-ate-this"
            accessibilityRole="button"
            onPress={() =>
              logMutation.mutate({
                date: localDateStr(),
                ...REBALANCE_PREVIEW,
                recipeId: meal.recipe.id,
                mealType: meal.mealType,
                slotIndex: meal.slotIndex,
                portionMultiplier: logPortion,
              })
            }
            className="min-h-12 min-w-0 flex-1 items-center justify-center py-2.5"
          >
            <Text className="text-sm font-semibold text-primary">
              {logMutation.isPending
                ? t('today.home.tonight.logging')
                : t('today.home.tonight.ateThis')}
            </Text>
          </Pressable>
          {onSlotActions && (
            <SlotOverflowButton
              testID="tonight-slot-actions"
              mealType={meal.mealType}
              onPress={onSlotActions}
              className="mr-1"
            />
          )}
        </View>
      )}
      {logMutation.isError && (
        <Text className="px-4 pb-3 text-xs text-danger">
          {t('today.home.tonight.logError', { error: userFacingErrorMessage(logMutation.error) })}
        </Text>
      )}
    </Card>
  );
}

export function NothingTonightCard() {
  const { t } = useT();
  return (
    <Card testID="nothing-tonight-card">
      <Text className="text-sm font-semibold text-label">
        {t('today.home.tonight.nothingTitle')}
      </Text>
      <Text variant="muted" className="mt-0.5 text-xs">
        {t('today.home.tonight.nothingBody')}
      </Text>
      <Pressable
        testID="nothing-tonight-find-recipe"
        accessibilityRole="button"
        onPress={() => router.push('/recipes')}
        className="mt-2 min-h-11 justify-center self-start"
      >
        <Text className="text-sm font-semibold text-primary">
          {t('today.home.tonight.findRecipe')}
        </Text>
      </Pressable>
    </Card>
  );
}
