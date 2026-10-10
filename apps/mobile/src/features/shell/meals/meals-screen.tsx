import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { PLAN_TAILORING_POLL_MS } from '@chefer/types';
import {
  Button,
  DayStrip,
  duration,
  EntryCard,
  ErrorState,
  ExplainSheet,
  haptics,
  IconButton,
  ListRow,
  ListSection,
  MacroTiles,
  MediaTile,
  PressableScale,
  Screen,
  SegmentedControl,
  Text,
  TileGrid,
  useReducedMotion,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  aiConsentRequiredFor,
  canRemoveSlot,
  defaultWeekOffset,
  formatDateRange,
  formatKcal,
  getWeekStartDate,
  groupDaySlots,
  isTailoringRunning,
  localDateStr,
  PLAN_MEAL_MENU_COPY,
  PLAN_TAILORING_COPY,
  PLAN_WEEK_COPY,
  planButtonLabel,
  planShapeSummary,
  slotPortion,
  slotStates,
  sumPlanDay,
  userFacingErrorMessage,
  weekdayLongName,
  WELLNESS_COPY,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useHousehold } from '../../../hooks/use-household';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { trackPlanGenerated } from '../../../lib/analytics-events';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { useAiConsent } from '../../ai-consent/ai-consent-provider';
import { useAfterSheetExit } from '../../meal-plan/after-sheet-exit';
import { CompareWeeksSheet } from '../../meal-plan/compare-weeks-sheet';
import { dismissPlan, isPlanDismissed } from '../../meal-plan/dismissals';
import { planDayStatus } from '../../meal-plan/plan-day-totals';
import { PremiumChangesCard, type PremiumChanges } from '../../meal-plan/premium-changes-card';
import { RecipePickerSheet } from '../../meal-plan/recipe-picker-sheet';
import { RegenerateConfirm } from '../../meal-plan/regenerate-confirm';
import { useDayRollover } from '../../meal-plan/use-day-rollover';
import { useTailoringWatch } from '../../meal-plan/use-tailoring-watch';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { PlanMissSheet } from '../../nutrition/plan-miss-sheet';
import { openPremium } from '../../premium/open-premium';
import { RebalanceBanner } from '../../tracker/rebalance-banner';
import { RebalanceOffer, useRebalanceCheck } from '../../tracker/rebalance-offer';
import { SlotStatusLine } from '../../tracker/slot-controls';
import { mealLabel, SLOT_COPY, youHadText } from '../../tracker/slot-copy';
import { useSlotFlow } from '../../tracker/slot-flow';
import { ShellTopBar } from '../shell-chrome';
import { ChangeWeekSheet } from './change-week-sheet';
import {
  intParam,
  mealConflictText,
  mealsSafetyLine,
  mealTileLabel,
  mealTileMeta,
  todayDayIndex,
  weekStripDays,
  type WeekOffset,
} from './meals-model';
import { TailoringLine } from './tailoring-line';

// ─── Meals (10 Oct redesign, board "Plan") ─────────────────────────────────
// The new shell's Meals tab: This week / Next week, a day strip, the day's
// totals, the day's meals as photo tiles (one tap swaps), one safety line and
// the Cookbook entry. Same data and flows as the old Plan screen
// (`app/(food)/meal-plan.tsx`, which the old shell keeps): `mealPlan.*`
// mutations, consent, undo snackbars, rebalance, tailoring, the deep link
// `?week&day&swap&at`. Owner-approved removals: the training-day banner, the
// "Learned from…" pill, per-meal "checks passed" pills, the long disclaimer
// paragraph (now behind the safety line's info button), the shape summary
// row. A meal's other actions (keep, side dish, ate something else, skipped,
// remove a side) open from "More options" on its Change sheet.

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type Plan = NonNullable<RouterOutputs['mealPlan']['getForWeek']>;
type PlanMeal = Plan['days'][number]['meals'][number];

type PickerTarget = {
  /** `side` (FB7-04) adds a second dish of the type; `replace` swaps this slot. */
  kind: 'replace' | 'side';
  mealType: MealType;
  /** Index in `day.meals` — a curated day can hold two snacks. */
  slotIndex: number;
  mealName: string;
  /** T-08.10 (bug B-50): never offer this slot's own recipe as its replacement. */
  recipeId: string;
};

const WEEK_OPTIONS = [
  { value: '0' as const, label: 'This week', testID: 'meals-week-0' },
  { value: '1' as const, label: 'Next week', testID: 'meals-week-1' },
];

function weekLabelFor(weekOffset: number): string {
  const start = getWeekStartDate(weekOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return formatDateRange(start, end, 'short');
}

export function MealsScreen() {
  const colors = useThemeColors();
  // UX-FOOD-18 deep link (Today's Tonight "Swap"): `week=0&day=<0-6>&swap=dinner`,
  // `at` makes a repeat count as new. `replan=1` comes back from Meal settings:
  // the shape changed and this week already has a plan — ask about a new one.
  const params = useLocalSearchParams<{
    week?: string;
    day?: string;
    swap?: string;
    at?: string;
    replan?: string;
  }>();
  // T-08.1: next week from Friday 15:00 to Sunday, else this week (same as Shop).
  const [weekOffset, setWeekOffset] = useState<WeekOffset>(
    () => (intParam(params.week, 0, 1) as WeekOffset | null) ?? defaultWeekOffset(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState(
    () => intParam(params.day, 0, 6) ?? todayDayIndex(),
  );
  const [pendingSwap, setPendingSwap] = useState<MealType | null>(null);
  const [pendingReplan, setPendingReplan] = useState(false);
  const { markChecked } = useDayRollover(() => {
    setSelectedDay(todayDayIndex());
    setWeekOffset(defaultWeekOffset(new Date()));
  });
  const linkKey = `${params.week ?? ''}|${params.day ?? ''}|${params.swap ?? ''}|${params.at ?? ''}|${params.replan ?? ''}`;
  const appliedLinkKey = useRef<string | null>(null);
  useEffect(() => {
    if (appliedLinkKey.current === linkKey) return;
    const first = appliedLinkKey.current === null;
    appliedLinkKey.current = linkKey;
    const week = intParam(params.week, 0, 1) as WeekOffset | null;
    const dayParam = intParam(params.day, 0, 6);
    if (week !== null && !first) setWeekOffset(week);
    if (dayParam !== null && !first) setSelectedDay(dayParam);
    if (week !== null || dayParam !== null) markChecked();
    if (params.swap === 'breakfast' || params.swap === 'lunch' || params.swap === 'dinner') {
      setPendingSwap(params.swap);
    }
    if (params.replan === '1') setPendingReplan(true);
  }, [linkKey, params.week, params.day, params.swap, params.replan, markChecked]);

  const [leftovers, setLeftovers] = useState(false);
  const [poolExhaustedMessage, setPoolExhaustedMessage] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  // The picker keeps its kind and target through its exit animation.
  const lastPickerTarget = useRef<PickerTarget | null>(null);
  if (pickerTarget) lastPickerTarget.current = pickerTarget;
  const [changeWeekOpen, setChangeWeekOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [keepPicks, setKeepPicks] = useState(true);
  const [pinnedBeforeRegenerate, setPinnedBeforeRegenerate] = useState(0);
  const [lastGenerate, setLastGenerate] = useState<{
    planId: string;
    premiumChanges: PremiumChanges | null;
    previousPlanId: string | undefined;
  } | null>(null);
  const [changesDismissedFor, setChangesDismissedFor] = useState<string | null>(null);
  const [replanDismissedFor, setReplanDismissedFor] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [missDay, setMissDay] = useState(0);
  const [missOpen, setMissOpen] = useState(false);
  const openMiss = (dayOfWeek: number) => {
    setMissDay(dayOfWeek);
    setMissOpen(true);
  };
  const scrollRef = useRef<ScrollView>(null);
  const pickerExit = useAfterSheetExit();

  const isPremium = useIsPremium();
  const { memberCount } = useHousehold();
  const todayIndex = weekOffset === 0 ? todayDayIndex() : null;
  const reducedMotion = useReducedMotion();
  const { show: showSnackbar } = useSnackbar();
  // WP-08: protein-only mode shows protein, never kcal.
  const { proteinOnly } = useNumbersMode();

  // Live tailoring polls only while the chef works AND this tab is on screen.
  const isFocused = useIsFocused();
  const {
    data: plan,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset },
    {
      retry: false,
      refetchInterval: (query) =>
        isFocused && isTailoringRunning(query.state.data?.tailoring)
          ? PLAN_TAILORING_POLL_MS
          : false,
    },
  );
  const trainingDays = plan?.trainingDays ?? [];
  const rebalanceCheck = useRebalanceCheck(plan?.planId);

  // Everything derived from the plan lives on other (kept-mounted) tabs.
  const utils = trpc.useUtils();
  const invalidateDerived = () => {
    void utils.dashboard.summary.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };
  const { sawRunning, updatedDays } = useTailoringWatch(
    plan?.planId,
    plan?.tailoring,
    invalidateDerived,
  );

  // T-08.3: Undo restores the plan `generate` just replaced.
  const restoreMutation = trpc.mealPlan.restore.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
    },
    onError: (err, vars) =>
      showSnackbar({
        message: `Couldn't bring your previous week back. ${userFacingErrorMessage(err)}`,
        actionLabel: 'Try again',
        onAction: () => restoreMutation.mutate(vars),
      }),
  });

  const generateMutation = trpc.mealPlan.generate.useMutation({
    meta: { silent: true },
    onMutate: () => setPoolExhaustedMessage(null),
    onSuccess: (data) => {
      setLastGenerate({
        planId: data.planId,
        premiumChanges: data.premiumChanges ?? null,
        previousPlanId: data.previousPlanId,
      });
      setRegenerateConfirmOpen(false);
      // setData (not refetch): `previousPlanId`/`droppedPinned` live only on this response.
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
      const { previousPlanId } = data;
      const keptCount =
        previousPlanId && data.droppedPinned !== undefined
          ? Math.max(0, pinnedBeforeRegenerate - data.droppedPinned)
          : 0;
      trackPlanGenerated(data, keptCount);
      if (previousPlanId) {
        const keptNote = keptCount > 0 ? ` Kept ${keptCount} of your picks.` : '';
        showSnackbar({
          message: `New week planned.${keptNote}`,
          actionLabel: 'Undo',
          onAction: () => restoreMutation.mutate({ planId: previousPlanId }),
          tone: 'success',
        });
      }
    },
    onError: (err) => {
      if (err.data?.code === 'PRECONDITION_FAILED') {
        const cause = (err.data as { poolExhausted?: { message?: string } } | undefined)
          ?.poolExhausted;
        setPoolExhaustedMessage(cause?.message ?? userFacingErrorMessage(err));
      }
    },
  });

  // AI data consent (App Store 5.1.2(i)): premium generation and swaps ask first.
  const requestAiConsent = useAiConsent();
  const generateWithConsent = (keepPinned?: boolean) => {
    // UX-PLAN-03: one generation at a time.
    if (generateMutation.isPending) return;
    requestAiConsent(
      'meal-plan',
      () =>
        generateMutation.mutate({
          weekOffset,
          ...(leftovers && { leftovers: true }),
          ...(keepPinned !== undefined && { keepPinned }),
          // T-06.7 follow-up: no per-call fitTrainingDays — the API applies
          // the choice saved on Meal settings (premium only).
        }),
      { usesAi: aiConsentRequiredFor('meal-plan', isPremium) },
    );
  };

  const resumeTailoringMutation = trpc.mealPlan.resumeTailoring.useMutation({
    meta: { silent: true },
    onSuccess: (data) => utils.mealPlan.getForWeek.setData({ weekOffset }, data),
    onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }),
  });
  const resumeTailoring = () => {
    if (!plan) return;
    const planId = plan.planId;
    requestAiConsent('meal-plan', () => resumeTailoringMutation.mutate({ planId }), {
      usesAi: true,
    });
  };

  const pinnedCount = plan?.days.flatMap((d) => d.meals).filter((m) => m.pinned).length ?? 0;
  const plannedMealsCount = plan?.days.flatMap((d) => d.meals).length ?? 0;
  const openRegenerateConfirm = () => {
    generateMutation.reset();
    setKeepPicks(true);
    setPinnedBeforeRegenerate(pinnedCount);
    setRegenerateConfirmOpen(true);
  };

  const pinMutation = trpc.mealPlan.setSlotPinned.useMutation({
    meta: { silent: true },
    onSuccess: () => void refetch(),
    onError: (err) =>
      showSnackbar({ message: `Couldn't update that pin. ${userFacingErrorMessage(err)}` }),
  });
  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setPickerTarget(null);
      void refetch();
      invalidateDerived();
    },
  });
  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setPickerTarget(null);
      void refetch();
      invalidateDerived();
    },
  });
  const addToWeekMutation = trpc.recipe.addToWeek.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void refetch();
      invalidateDerived();
    },
  });
  const undoAddMutation = trpc.recipe.undoAddToWeek.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void refetch();
      invalidateDerived();
    },
    onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }),
  });
  const removeSlotMutation = trpc.mealPlan.removeSlot.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void refetch();
      invalidateDerived();
    },
    onError: (err) =>
      showSnackbar({ message: `Couldn't remove that dish. ${userFacingErrorMessage(err)}` }),
  });
  const planDayMutation = trpc.mealPlan.planDay.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
      showSnackbar({ message: `${weekdayLongName(selectedDay)} planned.`, tone: 'success' });
    },
    onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }),
  });

  // T-08.5/T-08.6: Replace and AI swap undo through `replaceRecipe` back to
  // the previous recipe and its previous pin (UX-PLAN-04).
  const undoSwap = (
    target: { mealType: MealType; slotIndex: number },
    previousRecipeId: string,
    previousPinned = false,
  ) => {
    if (!plan) return;
    replaceMutation.mutate({
      planId: plan.planId,
      dayOfWeek: selectedDay,
      mealType: target.mealType,
      slotIndex: target.slotIndex,
      recipeId: previousRecipeId,
      pinned: previousPinned,
    });
  };

  const closePicker = () => {
    setPickerTarget(null);
    swapMutation.reset();
    replaceMutation.reset();
    addToWeekMutation.reset();
  };

  const day = plan?.days.find((d) => d.dayOfWeek === selectedDay);
  const meals = useMemo(() => day?.meals ?? [], [day]);

  // UX-FOOD-18: open the replace picker for the deep-linked meal once its day is on screen.
  useEffect(() => {
    if (pendingSwap === null || isLoading) return;
    if (isError || !plan) {
      setPendingSwap(null);
      return;
    }
    const slotIndex = meals.findIndex((m) => m.type === pendingSwap);
    const meal = meals[slotIndex];
    if (meal) {
      setPickerTarget({
        kind: 'replace',
        mealType: pendingSwap,
        slotIndex,
        mealName: meal.recipe.name,
        recipeId: meal.recipe.id,
      });
    }
    setPendingSwap(null);
  }, [pendingSwap, isLoading, isError, plan, meals]);

  // Back from Meal settings with a changed shape: settings never regenerate by
  // themselves — a week that already has a plan gets the usual confirm.
  useEffect(() => {
    if (!pendingReplan || isLoading) return;
    setPendingReplan(false);
    if (plan) {
      generateMutation.reset();
      setKeepPicks(true);
      setPinnedBeforeRegenerate(pinnedCount);
      setRegenerateConfirmOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once the requested week has loaded
  }, [pendingReplan, isLoading, plan]);

  const { data: shape } = trpc.mealPlan.getShape.useQuery();

  // T-11.3: the live target vs the one this week was planned for.
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const liveKcal = targetsView?.effective.dailyCalorieTarget;
  const goal: string | null | undefined = targetsView ? targetsView.inputs.goal : undefined;
  const plannedKcal = plan?.calorieTarget;
  const replanNeeded =
    plan !== null &&
    plan !== undefined &&
    plannedKcal !== undefined &&
    liveKcal !== undefined &&
    plannedKcal > 0 &&
    Math.abs(liveKcal - plannedKcal) / plannedKcal >= 0.05 &&
    replanDismissedFor !== plan.planId &&
    !isPlanDismissed('replan', plan.planId);

  // T-10.7: the one-time card for THIS plan's premium regeneration.
  const premiumChanges =
    plan && lastGenerate?.planId === plan.planId ? lastGenerate.premiumChanges : null;
  const showPremiumChanges =
    plan !== null &&
    plan !== undefined &&
    premiumChanges !== null &&
    changesDismissedFor !== plan.planId &&
    !isPlanDismissed('premium-changes', plan.planId);

  // The day's real target: a training day's bump when it is applied (legacy maths).
  const targetForDay = (dayOfWeek: number): number | undefined => {
    const t = trainingDays.find((d) => d.dayOfWeek === dayOfWeek);
    return t?.applied && t.targetKcal !== undefined ? t.targetKcal : plan?.calorieTarget;
  };
  const missMeals = plan?.days.find((d) => d.dayOfWeek === missDay)?.meals ?? [];
  const missTotals = sumPlanDay(missMeals);
  const missGap = plan?.days.find((d) => d.dayOfWeek === missDay)?.proteinGapG;

  // WP-06: what became of today's and earlier days' slots (eaten / replaced / skipped).
  const selectedDate = getWeekStartDate(weekOffset);
  selectedDate.setDate(selectedDate.getDate() + selectedDay);
  const selectedDateStr = localDateStr(selectedDate);
  const canActOnSlots = weekOffset === 0 && selectedDay <= todayDayIndex();
  const slotFlow = useSlotFlow(selectedDateStr);
  const { data: dayLog } = trpc.tracker.getDay.useQuery(
    { date: selectedDateStr },
    { enabled: canActOnSlots && meals.length > 0, staleTime: 30_000 },
  );
  const slotStateList = dayLog
    ? slotStates(
        meals.map((m, i) => ({ type: m.type, recipeId: m.recipe.id, slotIndex: i })),
        dayLog.log?.loggedMeals ?? [],
        dayLog.skippedSlots,
      )
    : null;
  // The day's total leaves out a meal that was swapped or skipped.
  const plannedMealsOfDay = meals.filter((_, i) => {
    const status = slotStateList?.[i]?.status;
    return status !== 'replaced' && status !== 'skipped';
  });
  const totals = sumPlanDay(plannedMealsOfDay);
  const dayTarget = targetForDay(selectedDay);
  const dayStatus = planDayStatus({
    kcal: totals.kcal,
    calorieTarget: proteinOnly ? undefined : dayTarget,
    proteinGapG: day?.proteinGapG,
  });

  // FB7-04: "Remove from plan" on a side dish; Undo puts the same recipe back as a side.
  const removeSide = (meal: PlanMeal, slotIndex: number) => {
    if (!plan) return;
    removeSlotMutation.mutate(
      { planId: plan.planId, dayOfWeek: selectedDay, mealType: meal.type, slotIndex },
      {
        onSuccess: () =>
          showSnackbar({
            message: PLAN_MEAL_MENU_COPY.removed(meal.recipe.name),
            actionLabel: 'Undo',
            onAction: () =>
              addToWeekMutation.mutate(
                {
                  recipeId: meal.recipe.id,
                  weekOffset,
                  dayOfWeek: selectedDay,
                  mealType: meal.type,
                  mode: 'add',
                },
                { onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }) },
              ),
          }),
      },
    );
  };

  // The old "…" menu for one slot: keep in next plans, ate something else,
  // skipped it (while still to eat), add a side dish, remove a side.
  const openMealOptions = (slotIndex: number) => {
    const meal = meals[slotIndex];
    if (!plan || !meal) return;
    const isSide = meals.findIndex((m) => m.type === meal.type) !== slotIndex;
    slotFlow.openMenu({
      mealType: meal.type,
      slotIndex,
      name: meal.recipe.name,
      menu: {
        logActions: slotStateList?.[slotIndex]?.status === 'planned',
        pin: {
          pinned: meal.pinned === true,
          onToggle: () =>
            pinMutation.mutate({
              planId: plan.planId,
              dayOfWeek: selectedDay,
              mealType: meal.type,
              slotIndex,
              pinned: meal.pinned !== true,
            }),
        },
        onAddSide: () =>
          setPickerTarget({
            kind: 'side',
            mealType: meal.type,
            slotIndex,
            mealName: meal.recipe.name,
            recipeId: meal.recipe.id,
          }),
        ...(isSide &&
          canRemoveSlot(meals, slotIndex) && { onRemove: () => removeSide(meal, slotIndex) }),
      },
    });
  };

  const mealGroups = useMemo(() => groupDaySlots(meals), [meals]);
  const slotEntries = mealGroups.flatMap((group) => [
    { entry: group.main, isSide: false },
    ...group.sides.map((entry) => ({ entry, isSide: true })),
  ]);

  const weekLabel = weekLabelFor(weekOffset);
  const openSettings = () =>
    router.push({ pathname: '/settings/meals', params: { week: String(weekOffset) } });

  const renderTile = ({ entry, isSide }: (typeof slotEntries)[number]) => {
    const { meal, slotIndex } = entry;
    const label = mealTileLabel(meal.type, isSide);
    const changeLabel = isSide
      ? `Change ${meal.type} side`
      : `Change ${mealTileLabel(meal.type, false).toLowerCase()}`;
    const status = slotStateList?.[slotIndex]?.status;
    const conflict = mealConflictText(meal);
    const portion = slotPortion(meal.portion);
    return (
      <MediaTile
        key={`${meal.type}-${slotIndex}`}
        testID={`meals-tile-${meal.type}-${slotIndex}`}
        label={label}
        title={meal.recipe.name}
        meta={mealTileMeta(meal, isSide, proteinOnly)}
        imageUri={meal.recipe.imageUrl ? getRecipeImageUrl(meal.recipe.imageUrl) : null}
        illustration={<Icon name="cook" color={colors.brand} size={32} />}
        {...(conflict ? { badge: conflict } : status === 'eaten' ? { badge: 'Eaten' } : {})}
        accessibilityHint="Opens the recipe"
        onPress={() =>
          router.push({
            pathname: '/recipe/[id]',
            params: {
              id: meal.recipe.id,
              day: String(selectedDay),
              meal: meal.type,
              ...(portion !== 1 ? { portion: String(portion) } : {}),
            },
          })
        }
        action={
          <IconButton
            testID={`meals-swap-${meal.type}-${slotIndex}`}
            accessibilityLabel={changeLabel}
            className="bg-surface"
            icon={<Icon name="swap" color={colors.brand} />}
            onPress={() =>
              setPickerTarget({
                kind: 'replace',
                mealType: meal.type,
                slotIndex,
                mealName: meal.recipe.name,
                recipeId: meal.recipe.id,
              })
            }
          />
        }
      />
    );
  };

  const cookbookEntry = (
    <EntryCard
      testID="meals-cookbook"
      icon={<Icon name="recipes" color={colors.onBrand} />}
      title="Cookbook"
      subtitle="Your recipes and saves"
      onPress={() => router.push('/cookbook')}
      addLabel="Recipe"
      addAccessibilityLabel="New recipe"
      addIcon={<Icon name="add" color={colors.brand} size={18} />}
      onAdd={() => router.push('/recipe-form')}
    />
  );

  const safetyRows =
    plan?.tableSafety?.people.flatMap((person) => {
      const labels = person.items.filter((i) => i.kind !== 'dislike').map((i) => i.label);
      return labels.length > 0
        ? [{ label: person.isOwner ? 'You' : person.who, value: labels.join(', ') }]
        : [];
    }) ?? [];

  return (
    <Screen className="bg-canvas px-0">
      <ShellTopBar className="mx-4 mt-3" />
      <ScrollView
        ref={scrollRef}
        testID="meals-scroll"
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <SegmentedControl
          testID="meals-week"
          accessibilityLabel="Week"
          options={WEEK_OPTIONS}
          value={String(weekOffset) as '0' | '1'}
          onChange={(value) => setWeekOffset(Number(value) as WeekOffset)}
        />

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : isError && !plan ? (
          // A failed load is not an empty week — never offer Generate over it (F-X-3-1).
          <ErrorState title="Couldn't load your meal plan" onRetry={() => void refetch()} />
        ) : !plan ? (
          /* ── Empty week ─────────────────────────────────────────────── */
          <>
            <View
              testID="meals-empty"
              className="items-center gap-3 rounded-card border border-separator bg-surface px-4 py-8"
            >
              <Icon name="calendar" color={colors.labelTertiary} size={36} />
              <Text className="text-center text-headline font-semibold text-label">
                No plan for {weekLabel} yet
              </Text>
              <Text
                testID="meals-empty-summary"
                className="text-center text-subhead text-label-secondary"
              >
                {shape
                  ? planShapeSummary(shape)
                  : isPremium
                    ? 'Generate an AI plan personalised to your profile and ratings.'
                    : 'Generate a plan from our curated collection.'}
              </Text>
              <Button
                testID="meals-generate"
                loading={generateMutation.isPending}
                onPress={() => generateWithConsent()}
              >
                {generateMutation.isPending
                  ? 'Cooking up your week…'
                  : shape
                    ? planButtonLabel(shape)
                    : 'Generate Plan'}
              </Button>
              <Pressable
                testID="meals-change-shape"
                accessibilityRole="button"
                onPress={openSettings}
                className="min-h-11 items-center justify-center px-2"
              >
                <Text className="text-subhead font-semibold text-brand">Change what we plan</Text>
              </Pressable>
              {isPremium === true ? (
                <View className="min-h-11 flex-row items-center gap-3">
                  <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
                    Cook once, eat twice (leftover lunches)
                  </Text>
                  <Switch
                    testID="meals-leftovers"
                    accessibilityLabel="Cook once, eat twice (leftover lunches)"
                    value={leftovers}
                    onValueChange={setLeftovers}
                    trackColor={{ true: colors.brand, false: colors.separator }}
                  />
                </View>
              ) : null}
            </View>

            {poolExhaustedMessage ? (
              <View className="gap-2 rounded-card bg-brand-tint p-4">
                <Text testID="meals-pool-exhausted" className="text-headline text-label">
                  Our recipes can’t fill this week around your restrictions.
                </Text>
                <Text className="text-subhead text-label-secondary">{poolExhaustedMessage}</Text>
                <Button
                  testID="meals-pool-pick-recipes"
                  variant="outline"
                  onPress={() => router.push('/cookbook')}
                >
                  Pick recipes yourself
                </Button>
                {isPremium !== true ? (
                  <Button
                    testID="meals-pool-premium"
                    variant="ghost"
                    onPress={() => openPremium('pool-exhaustion')}
                  >
                    Premium builds a plan around them
                  </Button>
                ) : null}
              </View>
            ) : null}

            {generateMutation.isError && !poolExhaustedMessage ? (
              <Text
                testID="meals-generate-error"
                accessibilityLiveRegion="polite"
                className="text-subhead text-attention"
              >
                {userFacingErrorMessage(generateMutation.error)}
              </Text>
            ) : null}

            {cookbookEntry}
          </>
        ) : (
          /* ── Day view ──────────────────────────────────────────────── */
          <>
            <DayStrip
              testID="meals-days"
              days={weekStripDays(getWeekStartDate(weekOffset), todayIndex)}
              selectedKey={String(selectedDay)}
              onSelect={(key) => setSelectedDay(Number(key))}
            />

            <TailoringLine
              tailoring={plan.tailoring}
              sawRunning={sawRunning}
              onResume={
                isPremium === true && plan.tailoring?.canResume ? resumeTailoring : undefined
              }
              resuming={resumeTailoringMutation.isPending}
            />

            {/* A log elsewhere swapped future meals — say which, offer undo. */}
            <RebalanceBanner planId={plan.planId} onUndone={() => void refetch()} />
            {/* WP-07 / Change week → Rebalance: the preview's offer. */}
            <RebalanceOffer planId={plan.planId} onApplied={() => void refetch()} />

            {showPremiumChanges ? (
              <PremiumChangesCard
                changes={premiumChanges}
                hasPrevious={!!lastGenerate?.previousPlanId}
                onFixIt={openMiss}
                onCompare={() => setCompareOpen(true)}
                onDismiss={() => {
                  dismissPlan('premium-changes', plan.planId);
                  setChangesDismissedFor(plan.planId);
                }}
              />
            ) : null}

            {/* T-11.3: the target moved since this week was planned. */}
            {replanNeeded ? (
              <View testID="meals-replan-banner" className="gap-1 rounded-card bg-brand-tint p-3">
                <Text className="text-subhead text-label">
                  {proteinOnly
                    ? 'Your targets have changed since this week was planned. Re-plan to match them?'
                    : `This week was planned for ${formatKcal(plannedKcal)} kcal. Re-plan with ${formatKcal(liveKcal)} kcal?`}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    testID="meals-replan-action"
                    accessibilityRole="button"
                    onPress={openRegenerateConfirm}
                    className="min-h-11 justify-center px-2"
                  >
                    <Text className="text-subhead font-semibold text-brand">Re-plan</Text>
                  </Pressable>
                  <Pressable
                    testID="meals-replan-keep"
                    accessibilityRole="button"
                    onPress={() => {
                      dismissPlan('replan', plan.planId);
                      setReplanDismissedFor(plan.planId);
                    }}
                    className="min-h-11 justify-center px-2"
                  >
                    <Text className="text-subhead font-semibold text-brand">Keep</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {plan.firstScaledWeek === true ? (
              <Text testID="meals-first-scaled-week" className="text-caption text-label-secondary">
                Sized for your table of {memberCount + 1}, free for your first week
              </Text>
            ) : null}
            {plan.carriedOver ? (
              <Text testID="meals-carried-over" className="text-caption text-label-secondary">
                Continued from your last plan
              </Text>
            ) : null}

            {/* The day's totals: the legacy maths (portions, swapped/skipped left out). */}
            {meals.length > 0 ? (
              <View
                testID="meals-day-totals"
                accessibilityLabel="Day totals"
                className="gap-3 rounded-card border border-separator bg-surface p-4"
              >
                <Text className="text-subhead font-semibold text-label-secondary">
                  {weekdayLongName(selectedDay)}
                </Text>
                <View className="flex-row items-end justify-between gap-2">
                  {proteinOnly ? (
                    <Text testID="meals-day-protein" className="text-title1 font-bold text-label">
                      {totals.protein}
                      <Text className="text-headline font-semibold text-label-secondary">
                        {' '}
                        g protein
                      </Text>
                    </Text>
                  ) : (
                    <Text
                      testID="meals-day-kcal"
                      className="text-title1 font-bold text-label"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {formatKcal(totals.kcal)}
                      <Text className="text-headline font-semibold text-label-secondary">
                        {' '}
                        kcal
                      </Text>
                    </Text>
                  )}
                  {!proteinOnly && dayTarget ? (
                    <Text
                      testID="meals-day-target"
                      className="pb-1 text-subhead text-label-secondary"
                    >
                      target {formatKcal(dayTarget)}
                    </Text>
                  ) : null}
                </View>
                {proteinOnly ? null : (
                  <MacroTiles
                    testID="meals-day-macros"
                    protein={totals.protein}
                    carbs={totals.carbs}
                    fat={totals.fat}
                  />
                )}
                {dayStatus !== null ? (
                  // T-11.3: neutral and tappable — Bigger portions / Add a snack / Keep it.
                  <Pressable
                    testID="meals-day-status"
                    accessibilityRole="button"
                    accessibilityLabel={`${dayStatus}. See options`}
                    onPress={() => openMiss(selectedDay)}
                    className="min-h-11 flex-row items-center gap-1.5"
                  >
                    <Text className="min-w-0 flex-shrink text-subhead text-label-secondary">
                      {dayStatus}
                    </Text>
                    <Text className="text-subhead font-semibold text-brand">See options</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View className="flex-row items-center justify-between gap-2">
              <Text accessibilityRole="header" className="text-title3 font-bold text-label">
                Meals
              </Text>
              {/* MO-01: press feedback through PressableScale. */}
              <PressableScale
                testID="meals-change-week"
                accessibilityRole="button"
                accessibilityLabel="Change week"
                onPress={() => {
                  haptics.selection();
                  setChangeWeekOpen(true);
                }}
                className="min-h-11 flex-row items-center gap-1.5 px-1"
              >
                <Icon name="refresh" color={colors.brand} size={18} />
                <Text className="text-callout font-semibold text-brand">Change week</Text>
              </PressableScale>
            </View>

            {meals.length === 0 ? (
              // T-07.3: a day outside the chosen shape says so and offers `planDay`.
              <View className="items-center gap-2 rounded-card border border-separator bg-surface px-4 py-6">
                {day?.planned === false ? (
                  <>
                    <Text
                      testID="meals-day-unplanned"
                      className="text-center text-subhead text-label-secondary"
                    >
                      Not planned. You cook {shape ? planShapeSummary(shape) : 'some days'}.
                    </Text>
                    <Pressable
                      testID="meals-day-add"
                      accessibilityRole="button"
                      accessibilityLabel={`Plan ${weekdayLongName(selectedDay)} too`}
                      disabled={planDayMutation.isPending}
                      onPress={() =>
                        planDayMutation.mutate({ planId: plan.planId, dayOfWeek: selectedDay })
                      }
                      className="min-h-11 items-center justify-center px-2"
                    >
                      {planDayMutation.isPending ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : (
                        <Text className="text-subhead font-semibold text-brand">Plan this day</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <Text className="text-subhead text-label-secondary">
                    No meals planned for this day.
                  </Text>
                )}
              </View>
            ) : (
              // MO-13: a day the chef just replaced fades its new meals in
              // (opacity only — instant under Reduce Motion).
              <Animated.View
                key={meals.map((m) => m.recipe.id).join(',')}
                entering={
                  updatedDays.has(selectedDay)
                    ? FadeIn.duration(reducedMotion ? 0 : duration.deliberate)
                    : undefined
                }
                className="gap-2.5"
              >
                {updatedDays.has(selectedDay) ? (
                  <Text
                    testID="meals-day-updated"
                    className="text-caption font-semibold text-positive"
                  >
                    {PLAN_TAILORING_COPY.dayUpdated}
                  </Text>
                ) : null}
                <TileGrid testID="meals-tiles">{slotEntries.map(renderTile)}</TileGrid>
              </Animated.View>
            )}

            {/* WP-06: a slot eaten as something else, or skipped — with its undo. */}
            {slotEntries.map(({ entry }) => {
              const state = slotStateList?.[entry.slotIndex];
              const slotRef = { mealType: entry.meal.type, slotIndex: entry.slotIndex };
              const who = mealLabel(entry.meal.type);
              if (state?.status === 'replaced') {
                const replaced = state.entry;
                return (
                  <SlotStatusLine
                    key={`replaced-${entry.slotIndex}`}
                    testID={`meals-slot-replaced-${entry.slotIndex}`}
                    text={`${who}: ${youHadText(replaced, proteinOnly)}`}
                    actionLabel={replaced.entryId ? SLOT_COPY.remove : undefined}
                    onAction={() => {
                      if (!replaced.entryId || !replaced.custom) return;
                      slotFlow.actions.removeReplacement({
                        entryId: replaced.entryId,
                        name: replaced.custom.name,
                        estimatedBy: replaced.custom.estimatedBy,
                        kcal: replaced.kcal,
                        protein: replaced.protein,
                        carbs: replaced.carbs,
                        fat: replaced.fat,
                        unknownMacros: replaced.unknownMacros,
                        replacesSlot: slotRef,
                      });
                    }}
                  />
                );
              }
              if (state?.status === 'skipped') {
                return (
                  <SlotStatusLine
                    key={`skipped-${entry.slotIndex}`}
                    testID={`meals-slot-skipped-${entry.slotIndex}`}
                    text={`${who}: ${SLOT_COPY.skippedLabel}`}
                    actionLabel={SLOT_COPY.undo}
                    onAction={() => slotFlow.actions.unskipSlot(slotRef)}
                  />
                );
              }
              return null;
            })}

            {/* A dish that fails the table's rules is never shown silently. */}
            {slotEntries.map(({ entry }) => {
              const conflict = mealConflictText(entry.meal);
              return conflict ? (
                <Text
                  key={`conflict-${entry.slotIndex}`}
                  testID={`meals-conflict-${entry.slotIndex}`}
                  accessibilityRole="alert"
                  className="text-subhead text-attention"
                >
                  {entry.meal.recipe.name}: {conflict}. Check the ingredients or change it.
                </Text>
              ) : null;
            })}

            {/* Owner decision 10 Oct: one safety line, the full text on tap. */}
            <View testID="meals-safety" className="flex-row items-center gap-2">
              <Icon name="shield" color={colors.positive} size={18} />
              <Text
                testID="meals-safety-text"
                className="min-w-0 flex-1 text-caption text-label-secondary"
              >
                {mealsSafetyLine(plan.tableSafety)}
              </Text>
              <IconButton
                testID="meals-safety-info"
                accessibilityLabel="About meal suggestions and allergen checks"
                icon={<Icon name="info" color={colors.labelSecondary} />}
                onPress={() => setAboutOpen(true)}
              />
            </View>

            {cookbookEntry}
          </>
        )}
      </ScrollView>

      {plan ? (
        <>
          {slotFlow.host}

          <RecipePickerSheet
            visible={pickerTarget !== null}
            mealName={pickerTarget?.mealName ?? ''}
            eyebrow={lastPickerTarget.current?.kind === 'side' ? 'Add a side dish' : 'Change meal'}
            excludeRecipeId={pickerTarget?.recipeId}
            slotType={pickerTarget?.mealType}
            busy={
              replaceMutation.isPending || swapMutation.isPending || addToWeekMutation.isPending
            }
            error={
              (replaceMutation.error ? userFacingErrorMessage(replaceMutation.error) : undefined) ??
              (swapMutation.error ? userFacingErrorMessage(swapMutation.error) : undefined) ??
              (addToWeekMutation.error
                ? userFacingErrorMessage(addToWeekMutation.error)
                : undefined) ??
              null
            }
            unsafeError={
              (replaceMutation.error ?? addToWeekMutation.error)?.data?.code === 'FORBIDDEN'
            }
            onExited={pickerExit.onExited}
            actions={
              lastPickerTarget.current?.kind === 'replace' ? (
                <ListSection className="mb-3">
                  <ListRow
                    testID="meals-meal-options"
                    title="More options"
                    subtitle="Keep in next plans, add a side, skipped it"
                    icon={<Icon name="more" color={colors.brand} />}
                    onPress={() => {
                      const target = lastPickerTarget.current;
                      if (!target) return;
                      // The slot menu is another sheet: open it once this one is gone.
                      pickerExit.schedule(() => openMealOptions(target.slotIndex));
                      closePicker();
                    }}
                  />
                </ListSection>
              ) : undefined
            }
            onSelect={(recipeId, acknowledgeConflict) => {
              if (!pickerTarget) return;
              const target = pickerTarget;
              if (target.kind === 'side') {
                addToWeekMutation.mutate(
                  {
                    recipeId,
                    weekOffset,
                    dayOfWeek: selectedDay,
                    mealType: target.mealType,
                    mode: 'add',
                    ...(acknowledgeConflict && { acknowledgeConflict }),
                  },
                  {
                    onSuccess: (data) => {
                      setPickerTarget(null);
                      showSnackbar({
                        message: `Added as a side to ${mealLabel(target.mealType).toLowerCase()}`,
                        actionLabel: 'Undo',
                        onAction: () =>
                          undoAddMutation.mutate({
                            planId: data.planId,
                            dayOfWeek: data.dayOfWeek,
                            mealType: data.mealType,
                            slotIndex: data.slotIndex,
                            addedRecipeId: data.addedRecipeId,
                          }),
                        tone: 'success',
                      });
                    },
                  },
                );
                return;
              }
              const portion = meals[target.slotIndex]?.portion ?? 1;
              replaceMutation.mutate(
                {
                  planId: plan.planId,
                  dayOfWeek: selectedDay,
                  mealType: target.mealType,
                  slotIndex: target.slotIndex,
                  recipeId,
                  ...(acknowledgeConflict && { acknowledgeConflict }),
                },
                {
                  onSuccess: (data) => {
                    const { previousRecipeId, previousPinned } = data;
                    showSnackbar({
                      message: `Swapped to ${data.name}${portion !== 1 ? ` · ${portion}× portion` : ''}`,
                      actionLabel: previousRecipeId ? 'Undo' : undefined,
                      onAction: previousRecipeId
                        ? () => undoSwap(target, previousRecipeId, previousPinned === true)
                        : undefined,
                    });
                  },
                },
              );
            }}
            onAiSwap={
              isPremium === true && pickerTarget?.kind !== 'side'
                ? () => {
                    if (!pickerTarget) return;
                    const target = pickerTarget;
                    requestAiConsent('meal-swap', () =>
                      swapMutation.mutate(
                        {
                          planId: plan.planId,
                          dayOfWeek: selectedDay,
                          mealType: target.mealType,
                          slotIndex: target.slotIndex,
                        },
                        {
                          onSuccess: (data) => {
                            const { previousRecipeId, previousPinned } = data;
                            showSnackbar({
                              message: `Swapped to ${data.name}`,
                              actionLabel: previousRecipeId ? 'Undo' : undefined,
                              onAction: previousRecipeId
                                ? () => undoSwap(target, previousRecipeId, previousPinned === true)
                                : undefined,
                            });
                          },
                        },
                      ),
                    );
                  }
                : undefined
            }
            onClose={closePicker}
          />

          <ChangeWeekSheet
            visible={changeWeekOpen}
            onClose={() => setChangeWeekOpen(false)}
            weekOffset={weekOffset}
            onNewPlan={openRegenerateConfirm}
            regenerating={generateMutation.isPending}
            onSettings={openSettings}
            rebalance={
              weekOffset === 0
                ? {
                    state: rebalanceCheck.state,
                    onPress: () => {
                      void rebalanceCheck.check().then((result) => {
                        if (result === 'idle') {
                          scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
                        } else if (result === 'on-track') {
                          showSnackbar({ message: PLAN_WEEK_COPY.rebalance.onTrack });
                        } else if (result === 'error') {
                          showSnackbar({ message: PLAN_WEEK_COPY.rebalance.error });
                        }
                      });
                    },
                  }
                : undefined
            }
          />

          <ExplainSheet
            visible={aboutOpen}
            onClose={() => setAboutOpen(false)}
            eyebrow="Meals"
            title="About these meals"
            sentence={WELLNESS_COPY.mealPlanAdvisoryDisclaimer}
            rows={safetyRows}
            testID="meals-about"
          />

          <PlanMissSheet
            visible={missOpen}
            onClose={() => setMissOpen(false)}
            planId={plan.planId}
            dayOfWeek={missDay}
            dayName={weekdayLongName(missDay)}
            kcal={missTotals.kcal}
            protein={missTotals.protein}
            calorieTarget={targetForDay(missDay)}
            proteinGapG={missGap}
            goal={goal}
            onApplied={() => {
              void refetch();
              invalidateDerived();
            }}
            onAddSnack={() => router.push('/tracker')}
            onRebalance={() => void rebalanceCheck.check()}
          />

          <CompareWeeksSheet
            visible={compareOpen}
            onClose={() => setCompareOpen(false)}
            previousPlanId={lastGenerate?.previousPlanId}
            current={plan}
          />
        </>
      ) : null}

      {/* UX-08 §3 (PAT-5): a new plan always asks; "Keep" defaults on. */}
      <RegenerateConfirm
        visible={regenerateConfirmOpen}
        onClose={() => setRegenerateConfirmOpen(false)}
        weekLabel={weekLabel}
        weekOffset={weekOffset}
        plannedMealsCount={plannedMealsCount}
        pinnedCount={pinnedCount}
        keepPicks={keepPicks}
        onKeepPicksChange={setKeepPicks}
        busy={generateMutation.isPending}
        error={
          generateMutation.isError
            ? (poolExhaustedMessage ?? userFacingErrorMessage(generateMutation.error))
            : null
        }
        onConfirm={() => generateWithConsent(keepPicks)}
      />
    </Screen>
  );
}
