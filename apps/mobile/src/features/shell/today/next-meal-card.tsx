import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  haptics,
  MediaFrame,
  PressableScale,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  formatPortion,
  HERO_LOGGED_HOLD_MS,
  localDateStr,
  slotPortion,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';
import { trackMealLogged } from '../../../lib/analytics-events';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from '../../tracker/rebalance-offer-store';
import { BoardCard } from './parts';
import { mealTypeLabel } from './today-helpers';

// Today's "Next meal" (10 Oct redesign, board Home): the framed photo, the
// meal, and four labelled actions in one row — Eaten, Cook now, Swap, Skip.
//  - Eaten logs the planned recipe in one tap (tracker.logRecipe, atomic and
//    idempotent — the old HeroMealCard's "I ate this"), holds the card on that
//    meal for a moment so a double tap can't log the next one (UX-FOOD-15) and
//    offers Undo in a snackbar;
//  - Cook now opens cook mode at the slot's portion;
//  - Swap opens the Meals day with this meal's replace picker (the deep link
//    Today's Tonight "Swap" used, UX-FOOD-18);
//  - Skip is WP-06's "Skipped it" (tracker.skipSlot), Undo in the snackbar.

type NextMeal = NonNullable<RouterOutputs['dashboard']['summary']['nextMeal']>;

/** Plan's deep link opens the replace picker for these meal types. */
const SWAPPABLE = new Set(['breakfast', 'lunch', 'dinner']);

export interface NextMealCardProps {
  meal: NextMeal;
  /** Monday-first index of today (the plan day the meal is on). */
  dayIndex: number;
  proteinOnly: boolean;
  onSkip: (slot: { mealType: string; slotIndex: number }) => void;
  skipping?: boolean;
}

function MealAction({
  label,
  icon,
  primary = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon: IconName;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    // MO-01: press feedback via PressableScale; selection haptic on tap.
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={cn(
        'min-h-14 min-w-0 flex-1 items-center justify-center gap-1 rounded-control px-1 py-2',
        primary ? 'bg-brand' : 'bg-brand-tint',
        disabled && 'opacity-60',
      )}
    >
      <Icon name={icon} color={primary ? colors.onBrand : colors.brand} size={20} />
      <Text
        numberOfLines={1}
        className={cn('text-subhead font-semibold', primary ? 'text-brand-on' : 'text-brand')}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function NextMealCard({
  meal: nextMeal,
  dayIndex,
  proteinOnly,
  onSkip,
  skipping = false,
}: NextMealCardProps) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  // UX-FOOD-15: the summary refetch moves the card on to the NEXT meal under
  // the thumb, so the meal just logged is held (as "Eaten ✓") for a moment.
  const [held, setHeld] = useState<NextMeal | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meal = held ?? nextMeal;

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  const release = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHeld(null);
  };

  const refreshDay = () => {
    void utils.dashboard.summary.invalidate();
    void utils.tracker.getDay.invalidate();
    void utils.tracker.weeklySummary.invalidate();
  };

  const slotArgs = (m: NextMeal) => ({
    recipeId: m.recipe.id,
    mealType: m.mealType,
    // The plan slot, so the second of two identical snacks logs as its own entry.
    ...(m.slotIndex !== undefined && { slotIndex: m.slotIndex }),
  });

  const unlog = trpc.tracker.unlogRecipe.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      release();
      refreshDay();
    },
    onError: (error) =>
      snackbar.show({ message: `Couldn't undo that. ${userFacingErrorMessage(error)}` }),
  });

  const log = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result, variables) => {
      const logged = meal;
      trackMealLogged('planned', logged.mealType);
      // A log can offer to rebalance the week — same hand-off as the tracker.
      recordRebalanceOutcome(result);
      haptics.success();
      if (holdTimer.current) clearTimeout(holdTimer.current);
      setHeld(logged);
      holdTimer.current = setTimeout(release, HERO_LOGGED_HOLD_MS);
      refreshDay();
      snackbar.show({
        message: `Logged ${logged.recipe.name}`,
        tone: 'success',
        actionLabel: 'Undo',
        onAction: () => unlog.mutate({ date: variables.date, ...slotArgs(logged) }),
      });
    },
    onError: (error) =>
      snackbar.show({ message: `Couldn't log it. ${userFacingErrorMessage(error)}` }),
  });

  const holding = held !== null;
  // P1-1: a portioned plan slot opens, cooks and logs at its portion (kcal is
  // already scaled to it). logRecipe takes 0.5–2×, like the tracker.
  const portion = meal.portion;
  const logPortion = Math.min(2, Math.max(0.5, slotPortion(portion)));
  const totalMins = meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0);
  const portionText = portion !== undefined ? `${formatPortion(portion)} portion` : null;
  const meta = [proteinOnly ? null : `${meal.recipe.kcal} kcal`, `${totalMins} min`, portionText]
    .filter(Boolean)
    .join(' · ');

  const openRecipe = () =>
    router.push(`/recipe/${meal.recipe.id}${portion !== undefined ? `?portion=${portion}` : ''}`);

  const cookNow = () =>
    router.push({
      pathname: '/cook/[id]',
      params: {
        id: meal.recipe.id,
        meal: meal.mealType,
        ...(portion !== undefined && { portion: String(portion) }),
      },
    });

  // UX-FOOD-18: name this week and today's day explicitly (Meals may open on
  // next week on a Friday evening) and ask for the meal's replace picker; `at`
  // makes a repeat of the same link count as a new one.
  const swap = () =>
    router.push({
      pathname: '/plan',
      params: {
        week: '0',
        day: String(meal.dayOfWeek ?? dayIndex),
        ...(SWAPPABLE.has(meal.mealType) && { swap: meal.mealType }),
        at: String(Date.now()),
      },
    });

  const label = mealTypeLabel(meal.mealType);

  return (
    <BoardCard testID="next-meal-card">
      <PressableScale
        testID="next-meal-open"
        pressScale="card"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${meal.recipe.name}, ${meta}`}
        accessibilityHint="Opens the recipe"
        onPress={openRecipe}
        className="flex-row items-center gap-3"
      >
        <MediaFrame
          imageUri={getRecipeImageUrl(meal.recipe.imageUrl)}
          size={84}
          square
          testID="next-meal-photo"
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text testID="next-meal-type" className="text-subhead font-semibold text-brand">
            {label}
          </Text>
          <Text
            testID="next-meal-name"
            numberOfLines={2}
            className="text-headline font-bold text-label"
          >
            {meal.recipe.name}
          </Text>
          <Text testID="next-meal-meta" className="text-subhead text-label-secondary">
            {meta}
          </Text>
        </View>
      </PressableScale>
      <View className="flex-row gap-2">
        <MealAction
          testID="next-meal-eaten"
          label={holding ? 'Eaten ✓' : 'Eaten'}
          icon="checkmark"
          primary
          disabled={holding || log.isPending}
          accessibilityLabel={holding ? `${meal.recipe.name} logged` : `Mark ${label} as eaten`}
          onPress={() =>
            log.mutate({
              date: localDateStr(),
              ...REBALANCE_PREVIEW,
              ...slotArgs(meal),
              portionMultiplier: logPortion,
            })
          }
        />
        <MealAction
          testID="next-meal-cook"
          label="Cook now"
          icon="cook"
          accessibilityLabel={`Cook ${meal.recipe.name} now`}
          onPress={cookNow}
        />
        <MealAction
          testID="next-meal-swap"
          label="Swap"
          icon="swap"
          disabled={holding}
          accessibilityLabel={`Swap ${label}`}
          onPress={swap}
        />
        <MealAction
          testID="next-meal-skip"
          label="Skip"
          icon="skip"
          disabled={holding || skipping}
          accessibilityLabel={`Skip ${label}`}
          onPress={() => onSkip({ mealType: meal.mealType, slotIndex: meal.slotIndex ?? 0 })}
        />
      </View>
    </BoardCard>
  );
}
