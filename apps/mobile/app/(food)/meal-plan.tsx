import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { PLAN_TAILORING_POLL_MS } from '@chefer/types';
import {
  Button,
  Card,
  DENSE_MAX_FONT_SCALE,
  duration,
  ErrorState,
  Screen,
  Text,
  useReducedMotion,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  aiConsentRequiredFor,
  checkedForLineText,
  cn,
  defaultWeekOffset,
  dinnersFromPlan,
  formatDateRange,
  formatKcal,
  formatMoney,
  formatPriceRange,
  getWeekStartDate,
  isTailoringRunning,
  PLAN_TAILORING_COPY,
  planButtonLabel,
  planShapeSummary,
  SAFETY_COPY,
  sumPlanDay,
  userFacingErrorMessage,
  weekdayLongName,
  weekdayShortName,
  WELLNESS_COPY,
} from '@chefer/utils';
import { useAiConsent } from '../../src/features/ai-consent/ai-consent-provider';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { CompareWeeksSheet } from '../../src/features/meal-plan/compare-weeks-sheet';
import { dismissPlan, isPlanDismissed } from '../../src/features/meal-plan/dismissals';
import { DAY_LABELS, PlanDayChips } from '../../src/features/meal-plan/plan-day-chips';
import { PlanDayTotals } from '../../src/features/meal-plan/plan-day-totals';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { PlanSettingsSheet } from '../../src/features/meal-plan/plan-settings-sheet';
import {
  PremiumChangesCard,
  type PremiumChanges,
} from '../../src/features/meal-plan/premium-changes-card';
import { RecipePickerSheet } from '../../src/features/meal-plan/recipe-picker-sheet';
import { RegenerateConfirm } from '../../src/features/meal-plan/regenerate-confirm';
import { TailoringBanner } from '../../src/features/meal-plan/tailoring-banner';
import {
  PreRunNote,
  TrainingDayHeader,
  TrainingExplainSheet,
} from '../../src/features/meal-plan/training-day-header';
import { useTailoringWatch } from '../../src/features/meal-plan/use-tailoring-watch';
import { WeekSummarySheet, type DaySummary } from '../../src/features/meal-plan/week-summary-sheet';
import { PlanMissSheet } from '../../src/features/nutrition/plan-miss-sheet';
import { openPremium } from '../../src/features/premium/open-premium';
import { ReportSafetySheet } from '../../src/features/safety/report-sheet';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { useCurrency } from '../../src/hooks/use-currency';
import { useHousehold } from '../../src/hooks/use-household';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { trpc } from '../../src/lib/trpc';

// Plan tab — port of apps/web (dashboard)/meal-plan/page.tsx (M2-2), which
// already renders day-by-day on phones (DayView), incl. the week-rebalance
// banner with undo (P1-7). Deviations, deliberate: recipe-photo SSE
// streaming waits for M3-1; the pantry banner for M2-6/M2-10. Per-meal replace opens RecipePickerSheet (pick a recipe, any
// tier; AI regen in its footer, premium) — mobile-first, not on web yet.

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return formatDateRange(weekStart, end, 'short');
}

export default function MealPlanScreen() {
  // T-08.1 (UX-08 AC1): Plan and Shop both default to next week from Friday
  // 15:00 to Sunday 23:59 local, else this week — the same `defaultWeekOffset`
  // shared with the Shop tab (@chefer/utils).
  const [weekOffset, setWeekOffset] = useState<number>(() => defaultWeekOffset(new Date()));
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex());
  const [leftovers, setLeftovers] = useState(false);
  const [poolExhaustedMessage, setPoolExhaustedMessage] = useState<string | null>(null);
  const [personalisation, setPersonalisation] = useState<{
    pinnedDishNames: string[];
    likedCount: number;
    dislikedCount: number;
  } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    mealType: MealType;
    /** Index in `day.meals` — a curated day can hold two snacks. */
    slotIndex: number;
    mealName: string;
    /** T-08.10 (bug B-50): never offer this slot's own recipe as its replacement. */
    recipeId: string;
  } | null>(null);
  // L-SAFE2/T-01.5: long-press "Report a safety problem" on a plan card,
  // same sheet as the recipe-detail overflow action.
  const [reportTarget, setReportTarget] = useState<{
    recipeId: string;
    recipeName: string;
  } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [keepPicks, setKeepPicks] = useState(true);
  // Snapshot of how many picks existed when Regenerate was confirmed — the
  // snackbar's "Kept N of your picks" needs the BEFORE count; `plan` itself
  // has already been replaced by the time the mutation resolves.
  const [pinnedBeforeRegenerate, setPinnedBeforeRegenerate] = useState(0);
  // Dismissed once per mount — reopening the tab re-announces it, matching
  // "announced once on open" (UX-08 a11y) closely enough without persistence.
  const [weekendLineDismissed, setWeekendLineDismissed] = useState(false);
  // T-06.7: the `Fit meals to my training days` choice (null = never touched →
  // on when the user has training days). Sent with the next generate call.
  const [fitTrainingPref, setFitTrainingPref] = useState<boolean | null>(null);
  // T-06.7 / T-10.7: the extras only a `generate` response carries, held for
  // this session (never persisted beyond the per-plan dismissals below).
  const [lastGenerate, setLastGenerate] = useState<{
    planId: string;
    fitTrainingDays: boolean;
    premiumChanges: PremiumChanges | null;
    previousPlanId: string | undefined;
  } | null>(null);
  const [changesDismissedFor, setChangesDismissedFor] = useState<string | null>(null);
  const [replanDismissedFor, setReplanDismissedFor] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  // T-11.3: the day whose PlanMissSheet is open.
  const [missDay, setMissDay] = useState(0);
  const [missOpen, setMissOpen] = useState(false);
  const openMiss = (dayOfWeek: number) => {
    setMissDay(dayOfWeek);
    setMissOpen(true);
  };

  const isPremium = useIsPremium();
  const { memberCount } = useHousehold();
  const isPast = weekOffset < 0;
  const todayIndex = weekOffset === 0 ? getTodayDayIndex() : null;
  const isWeekendDefault = weekOffset === 1 && defaultWeekOffset(new Date()) === 1;

  // Live tailoring (premium instant week): poll only while the chef is still
  // working AND this tab is on screen; React Query also pauses it while the
  // app is backgrounded (focusManager ← AppState, app/_layout.tsx).
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
  const hasTrainingDays = trainingDays.length > 0;
  const fitTrainingDays = fitTrainingPref ?? true;

  // Everything derived from the plan lives on other (kept-mounted) tabs —
  // invalidate it all after any plan mutation so Home/Shop don't go stale.
  const utils = trpc.useUtils();
  const invalidateDerived = () => {
    void utils.dashboard.summary.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };

  const { show: showSnackbar } = useSnackbar();
  const reducedMotion = useReducedMotion();

  // Which days the chef just replaced (brief fade + note) and whether the
  // user watched it run (the DONE confirmation). A replaced day changes the
  // shopping list and Today too.
  const { sawRunning, updatedDays } = useTailoringWatch(
    plan?.planId,
    plan?.tailoring,
    invalidateDerived,
  );

  // T-08.3: Undo restores the plan `generate` just replaced (exactly, same
  // recipes and portions) — a fresh copy of the old plan, not a flag flip
  // (meal-plan.service.ts `restore`).
  const restoreMutation = trpc.mealPlan.restore.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
      if (__DEV__) console.warn('[analytics stub] regenerate_undone');
    },
    // UX-PLAN-14: the Undo snackbar has already gone, so a failed restore
    // must say so — and offer the retry the user just tried to make.
    onError: (err, vars) =>
      showSnackbar({
        message: `Couldn't bring your previous week back. ${userFacingErrorMessage(err)}`,
        actionLabel: 'Try again',
        onAction: () => restoreMutation.mutate(vars),
      }),
  });

  const generateMutation = trpc.mealPlan.generate.useMutation({
    meta: { silent: true },
    onMutate: () => {
      setPoolExhaustedMessage(null);
      setPersonalisation(null);
    },
    onSuccess: (data) => {
      setPersonalisation(data.personalisation ?? null);
      setLastGenerate({
        planId: data.planId,
        fitTrainingDays: data.fitTrainingDays === true,
        premiumChanges: data.premiumChanges ?? null,
        previousPlanId: data.previousPlanId,
      });
      setSummaryOpen(false);
      setRegenerateConfirmOpen(false);
      // setData (not refetch): `previousPlanId`/`droppedPinned`/`unfilled`
      // are present only on this response, never on a later read.
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
      // T-08.3 (UX-08 §3): only a regeneration (a previous plan existed for
      // this week) gets the "New week planned" snackbar + Undo.
      const { previousPlanId } = data;
      if (previousPlanId) {
        const keptCount =
          data.droppedPinned !== undefined
            ? Math.max(0, pinnedBeforeRegenerate - data.droppedPinned)
            : 0;
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
        // T-10.4: the structured cause (`error.data.poolExhausted`) isn't
        // wired through `trpc.ts` on this branch yet (not owned by this lane)
        // — read it defensively so the richer copy appears the moment the
        // orchestrator wires it, with no crash meanwhile.
        const cause = (err.data as { poolExhausted?: { message?: string } } | undefined)
          ?.poolExhausted;
        setPoolExhaustedMessage(cause?.message ?? userFacingErrorMessage(err));
      }
    },
  });

  // AI data consent (App Store 5.1.2(i)): premium generation and swaps send
  // the profile to the AI provider; free ones are curated and never ask.
  const requestAiConsent = useAiConsent();
  const generateWithConsent = (keepPinned?: boolean) => {
    // UX-PLAN-03: one generation at a time — a second tap used to send a
    // second request and burn the last free generation.
    if (generateMutation.isPending) return;
    requestAiConsent(
      'meal-plan',
      () =>
        generateMutation.mutate({
          weekOffset,
          ...(leftovers && { leftovers: true }),
          ...(keepPinned !== undefined && { keepPinned }),
          ...(isPremium === true && hasTrainingDays && { fitTrainingDays }),
        }),
      { usesAi: aiConsentRequiredFor('meal-plan', isPremium) },
    );
  };

  // "Tailor the rest" (PARTIAL/FAILED): re-queues only the untailored days —
  // no new plan-generation quota. Consent-gated like any premium AI call.
  const resumeTailoringMutation = trpc.mealPlan.resumeTailoring.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
    },
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

  // Visible under the day chips (UX-08 §2) — always asks first (§3).
  const openRegenerateConfirm = () => {
    generateMutation.reset(); // a previous failure's message doesn't greet the new ask
    setSummaryOpen(false);
    setKeepPicks(true);
    setPinnedBeforeRegenerate(pinnedCount);
    setRegenerateConfirmOpen(true);
  };

  const pinMutation = trpc.mealPlan.setSlotPinned.useMutation({
    meta: { silent: true },
    onSuccess: () => void refetch(),
    // UX-PLAN-14: a failed pin must not look like nothing happened.
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

  // wave-1 L-PLAN (UX-07 "Plan this day"): fills just the tapped unplanned
  // day in place via the new `planDay` procedure — it used to open Plan
  // settings instead, which changes the whole week's shape rather than
  // adding this one day. setData (not refetch), same reasoning as generate.
  const planDayMutation = trpc.mealPlan.planDay.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      utils.mealPlan.getForWeek.setData({ weekOffset }, data);
      invalidateDerived();
      showSnackbar({ message: `${DAY_LABELS[selectedDay]} planned.`, tone: 'success' });
      if (__DEV__) console.warn('[analytics stub] plan_day_filled', { dayOfWeek: selectedDay });
    },
    onError: (err) => {
      // SnackbarOptions only has 'success' | 'info' (no error tone) — the
      // default (neutral) styling is used, same as elsewhere in this file.
      showSnackbar({ message: userFacingErrorMessage(err) });
    },
  });

  // T-08.5/T-08.6: Replace and AI swap are undoable the same way (Q-6: AI
  // swap ships as commit + Undo, no preview) — call `replaceRecipe` back to
  // the id that was in the slot. `target` is captured at click time so the
  // snackbar action still works after the picker closes.
  const undoSwap = (
    target: { mealType: MealType; slotIndex: number },
    previousRecipeId: string,
  ) => {
    if (!plan) return;
    replaceMutation.mutate({
      planId: plan.planId,
      dayOfWeek: selectedDay,
      mealType: target.mealType,
      slotIndex: target.slotIndex,
      recipeId: previousRecipeId,
    });
  };

  const closePicker = () => {
    setPickerTarget(null);
    swapMutation.reset();
    replaceMutation.reset();
  };

  // B-13 (T-00.15): confirms the server sent the WEEK actually asked for —
  // a monitoring signal for the "next week shown as this week" bug class,
  // not just this one fix. No mobile analytics SDK yet (see
  // src/features/gym/analytics.ts) — dev-only stub, wired to the real
  // transport in wave 1.
  useEffect(() => {
    if (isLoading) return;
    const expected = getWeekStartDate(weekOffset).toDateString();
    const weekMatches = !plan || new Date(plan.weekStartDate).toDateString() === expected;
    if (__DEV__) console.warn('[analytics stub] plan_shown', { surface: 'plan', weekMatches });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per load, not on every render
  }, [plan?.planId, plan?.weekStartDate, isLoading, weekOffset]);

  const weekLabel = formatWeekLabel(getWeekStartDate(weekOffset));
  const day = plan?.days.find((d) => d.dayOfWeek === selectedDay);
  const meals = day?.meals ?? [];
  const weekCost = plan?.estimatedCost?.totalEur ?? null;
  // Portions the cost is sized for — premium households only (P2-3).
  const costPortions = plan?.estimatedCost?.portions ?? null;
  // Costs are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = useCurrency();

  // T-07.3/T-07.5: the "how you cook" shape names the empty-week job and
  // feeds the Plan settings sheet — same query everywhere (onboarding,
  // Settings, here), so all three read the same values (UX-07 AC6).
  const { data: shape } = trpc.mealPlan.getShape.useQuery();
  const planShapeSummaryText = shape ? planShapeSummary(shape) : '';

  // T-11.3: the live target vs the one this week was planned for, and the
  // goal (a snack is never offered on LOSE_WEIGHT).
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const liveKcal = targetsView?.effective.dailyCalorieTarget;
  const goal: string | null | undefined = targetsView ? targetsView.inputs.goal : undefined;
  const plannedKcal = plan?.calorieTarget;
  const replanNeeded =
    plan !== null &&
    plan !== undefined &&
    !isPast &&
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
  const builtAroundTraining =
    plan !== null &&
    plan !== undefined &&
    lastGenerate?.planId === plan.planId &&
    lastGenerate.fitTrainingDays;

  const selectedTraining = trainingDays.find((d) => d.dayOfWeek === selectedDay);
  // The day's real target: a training day's bump when it is applied.
  const targetForDay = (dayOfWeek: number): number | undefined => {
    const t = trainingDays.find((d) => d.dayOfWeek === dayOfWeek);
    return t?.applied && t.targetKcal !== undefined ? t.targetKcal : plan?.calorieTarget;
  };
  const preRunDay = trainingDays.find(
    (d) => d.kind === 'long_run' && d.dayOfWeek === selectedDay + 1,
  );
  const missMeals = plan?.days.find((d) => d.dayOfWeek === missDay)?.meals ?? [];
  const missTotals = sumPlanDay(missMeals);
  const missGap = plan?.days.find((d) => d.dayOfWeek === missDay)?.proteinGapG;

  return (
    <Screen className="px-0">
      <ModeSwitch className="mx-4 mt-3" />
      {/* Week navigator */}
      <View className="flex-row items-center justify-between gap-2 px-4 py-3">
        <Pressable
          testID="plan-week-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          disabled={weekOffset <= MIN_OFFSET}
          onPress={() => setWeekOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-lg border border-border',
            weekOffset <= MIN_OFFSET && 'opacity-40',
          )}
        >
          <Ionicons name="chevron-back" size={18} color="#6b7280" />
        </Pressable>
        {/* Tapping the week label opens the WEEK summary (week-level actions
            live there — the screen below stays day-level) */}
        <Pressable
          testID="plan-week-summary"
          accessibilityRole="button"
          // No accessibilityLabel: the Pressable flattens its children into
          // one a11y element, so the label derives from the week text + badge
          // ("21 Sep – 27 Sep This Week") — screen readers and Maestro both
          // see the real content.
          // Guard in onPress, NOT via disabled: a disabled Pressable's subtree
          // (incl. the Past/This Week badge) drops out of the accessibility
          // tree on iOS, blinding Maestro's text asserts.
          onPress={() => {
            if (plan) setSummaryOpen(true);
          }}
          className="min-h-11 min-w-0 flex-shrink flex-row items-center gap-2"
        >
          <Text
            testID="plan-week-label"
            numberOfLines={1}
            maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
            className="min-w-0 flex-shrink text-sm font-medium text-gray-700"
          >
            {weekLabel}
          </Text>
          <View
            className={cn(
              'rounded-full px-2 py-0.5',
              isPast ? 'bg-gray-100' : weekOffset === 0 ? 'bg-accent' : 'bg-blue-50',
            )}
          >
            <Text
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-xs font-semibold uppercase',
                isPast ? 'text-gray-500' : weekOffset === 0 ? 'text-primary' : 'text-blue-600',
              )}
            >
              {isPast ? 'Past' : weekOffset === 0 ? 'This Week' : 'Next Week'}
            </Text>
          </View>
          {plan && <Ionicons name="chevron-down" size={14} color="#9ca3af" />}
        </Pressable>
        <Pressable
          testID="plan-week-next"
          accessibilityRole="button"
          accessibilityLabel="Next week"
          disabled={weekOffset >= MAX_OFFSET}
          onPress={() => setWeekOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-lg border border-border',
            weekOffset >= MAX_OFFSET && 'opacity-40',
          )}
        >
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </Pressable>
      </View>

      {/* UX-08 §1: explains why Plan opened on next week (Fri 15:00–Sun). */}
      {isWeekendDefault && !weekendLineDismissed && (
        <View
          testID="plan-weekend-line"
          accessibilityLiveRegion="polite"
          className="mx-4 mb-2 flex-row items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2"
        >
          <Text className="flex-1 text-xs text-blue-700">
            Showing next week — it&apos;s the weekend.
          </Text>
          <Pressable
            testID="plan-weekend-line-this-week"
            accessibilityRole="button"
            onPress={() => {
              setWeekendLineDismissed(true);
              setWeekOffset(0);
            }}
            className="min-h-11 items-center justify-center px-1"
          >
            <Text className="text-xs font-semibold text-blue-700">This week ›</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : isError && !plan ? (
        // A failed load is not an empty week — never offer Generate over a
        // plan we couldn't fetch (F-X-3-1).
        <ErrorState
          title="Couldn't load your meal plan"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      ) : !plan ? (
        /* ── Empty week ─────────────────────────────────────────────────── */
        <ScrollView contentContainerClassName="gap-4 px-4 py-6">
          <Card testID="plan-empty" className="items-center border-dashed py-10">
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text className="mb-1 mt-3 font-semibold text-gray-700">
              No plan for {weekLabel} yet
            </Text>
            {/* UX-07 §2/AC1,3: the summary + button name the shape, e.g.
                "4 dinners for 2 · Mon–Thu · up to 30 min" / "Plan 4 dinners" —
                falls back to the generic copy while the shape is loading. */}
            {shape ? (
              <Text
                testID="plan-empty-summary"
                variant="muted"
                className="mb-4 px-4 text-center text-sm"
              >
                {planShapeSummaryText}
              </Text>
            ) : (
              <Text variant="muted" className="mb-4 px-4 text-center text-sm">
                {isPremium
                  ? 'Generate an AI plan personalised to your profile and ratings.'
                  : 'Generate a plan from our curated collection.'}
              </Text>
            )}
            {!isPast && (
              <Button
                testID="plan-generate"
                loading={generateMutation.isPending}
                onPress={() => generateWithConsent()}
              >
                {generateMutation.isPending
                  ? 'Cooking up your week…'
                  : shape
                    ? planButtonLabel(shape)
                    : 'Generate Plan'}
              </Button>
            )}
            {!isPast && (
              <Pressable
                testID="plan-change-shape"
                accessibilityRole="button"
                onPress={() => setSettingsOpen(true)}
                className="mt-3 min-h-11 items-center justify-center px-2"
              >
                <Text className="text-xs font-semibold text-primary">Change what we plan</Text>
              </Pressable>
            )}
            {isPremium === true && !isPast && (
              <View className="mt-4 flex-row items-center gap-2">
                <Switch value={leftovers} onValueChange={setLeftovers} />
                <Text variant="muted" className="text-xs">
                  Cook once, eat twice (leftover lunches)
                </Text>
              </View>
            )}
          </Card>

          {poolExhaustedMessage && (
            <Card className="border-primary/20 bg-accent">
              <Text testID="plan-pool-exhausted" className="text-sm font-semibold text-primary">
                Our recipes can’t fill this week around your restrictions.
              </Text>
              <Text className="mt-1 text-xs text-primary/80">{poolExhaustedMessage}</Text>
              {/* T-10.4: two ways forward, neither one relaxes a safety rule. */}
              <View className="mt-3 gap-2">
                <Button
                  testID="plan-pool-pick-recipes"
                  variant="outline"
                  onPress={() => router.push('/recipes')}
                >
                  Pick recipes yourself
                </Button>
                {isPremium !== true && (
                  <Button
                    testID="plan-pool-premium"
                    variant="ghost"
                    onPress={() => openPremium('pool-exhaustion')}
                  >
                    Premium builds a plan around them
                  </Button>
                )}
              </View>
            </Card>
          )}

          {generateMutation.isError && !poolExhaustedMessage && (
            <Card className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">
                {userFacingErrorMessage(generateMutation.error)}
              </Text>
            </Card>
          )}
        </ScrollView>
      ) : (
        /* ── Day view ───────────────────────────────────────────────────── */
        <>
          {/* UX-07 §2: compact "how you cook" summary + settings entry point. */}
          {shape && (
            <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
              <Text
                testID="plan-shape-summary"
                numberOfLines={1}
                className="min-w-0 flex-1 text-xs text-gray-500"
              >
                {planShapeSummaryText}
              </Text>
              <Pressable
                testID="plan-settings-open"
                accessibilityRole="button"
                accessibilityLabel="Plan settings"
                onPress={() => setSettingsOpen(true)}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="options-outline" size={20} color="#6b7280" />
              </Pressable>
            </View>
          )}

          {/* Live tailoring: the week is usable now; the chef finishes it day by day */}
          {!isPast && (
            <TailoringBanner
              tailoring={plan.tailoring}
              sawRunning={sawRunning}
              onResume={
                isPremium === true && plan.tailoring?.canResume ? resumeTailoring : undefined
              }
              resuming={resumeTailoringMutation.isPending}
            />
          )}

          {/* Day chips (training days carry a glyph — T-06.4) */}
          <PlanDayChips
            plan={plan}
            selectedDay={selectedDay}
            todayIndex={todayIndex}
            onSelect={setSelectedDay}
          />

          {/* UX-08 §2/AC6: week actions visible, cost as a range that names
              what it covers — never a single precise number. */}
          {!isPast && (
            <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
              <Text testID="plan-week-cost" className="min-w-0 flex-1 text-xs text-gray-600">
                {weekCost !== null
                  ? `≈ ${formatPriceRange(weekCost, currency) ?? formatMoney(weekCost, currency)}`
                  : 'Cost estimate unavailable'}
                {' · Mon–Sun'}
                {costPortions !== null
                  ? ` · ${costPortions} portion${costPortions === 1 ? '' : 's'}`
                  : memberCount > 0
                    ? ' · 1 portion'
                    : ''}
              </Text>
              <Button
                testID="plan-regenerate-action"
                variant="outline"
                size="sm"
                loading={generateMutation.isPending}
                onPress={openRegenerateConfirm}
              >
                <Ionicons name="refresh-outline" size={14} color="#944a00" />
                <Text className="text-sm font-medium text-foreground">Regenerate</Text>
              </Button>
            </View>
          )}
          {/* T-10.4 (D-7): the free household week is sized for the table. */}
          {!isPast && plan.firstScaledWeek === true && (
            <Text testID="plan-first-scaled-week" className="px-4 pb-2 text-xs text-gray-600">
              Sized for your table of {memberCount + 1} — free for your first week
            </Text>
          )}

          <ScrollView
            testID="plan-day-scroll"
            contentContainerClassName="gap-3 px-4 py-2 pb-8"
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
            }
          >
            {/* A log elsewhere swapped future meals — say which, offer undo */}
            <RebalanceBanner planId={plan.planId} onUndone={() => void refetch()} />

            {/* T-06.7: this week was built around the routine's training days. */}
            {builtAroundTraining && (
              <Text testID="plan-built-around-training" className="px-1 text-xs text-primary">
                Your week is built around your training days
              </Text>
            )}

            {/* T-10.7: one-time, after a premium regeneration. */}
            {showPremiumChanges && (
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
            )}

            {/* T-11.3: the target moved since this week was planned. */}
            {replanNeeded && (
              <View testID="plan-replan-banner" className="gap-1 rounded-xl bg-blue-50 px-3 py-2">
                <Text className="text-sm text-blue-800">
                  This week was planned for {formatKcal(plannedKcal)} kcal. Re-plan with{' '}
                  {formatKcal(liveKcal)} kcal?
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    testID="plan-replan-action"
                    accessibilityRole="button"
                    onPress={openRegenerateConfirm}
                    className="min-h-11 justify-center px-2"
                  >
                    <Text className="text-sm font-semibold text-blue-800">Re-plan</Text>
                  </Pressable>
                  <Pressable
                    testID="plan-replan-keep"
                    accessibilityRole="button"
                    onPress={() => {
                      dismissPlan('replan', plan.planId);
                      setReplanDismissedFor(plan.planId);
                    }}
                    className="min-h-11 justify-center px-2"
                  >
                    <Text className="text-sm font-semibold text-blue-800">Keep</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* T-02.4: week-level safety line — the table has rules, so this
                week's meals were checked against them (PAT-2, UX-02 §3). A
                plain text row is enough for this pass; the full
                checked/needs-a-look/can't-check card is a later lane. The
                title is always the exact SAFETY_COPY.weekCardTitle string
                (Maestro asserts it verbatim); a representative rule list
                from checkedForLineText follows as a second, muted line when
                one can be assembled. */}
            {plan.tableSafety?.hasRules && (
              <View testID="plan-week-safety" className="gap-0.5 px-1">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="shield-checkmark-outline" size={13} color="#944a00" />
                  <Text className="text-xs font-medium text-primary">
                    {SAFETY_COPY.weekCardTitle}
                  </Text>
                </View>
                {(() => {
                  const rules = plan.tableSafety.people.flatMap((person) =>
                    person.items.slice(0, 2).map((item) => ({
                      label: item.label,
                      who: person.isOwner ? 'you' : person.who,
                    })),
                  );
                  return rules.length > 0 ? (
                    <Text variant="muted" numberOfLines={1} className="text-xs">
                      {checkedForLineText(rules.slice(0, 3))}
                    </Text>
                  ) : null;
                })()}
              </View>
            )}

            {/* Badges row */}
            <View className="flex-row flex-wrap gap-2">
              {plan.carriedOver && (
                <View
                  testID="plan-carried-over"
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1"
                >
                  <Text className="text-xs font-medium text-blue-700">
                    Continued from your last plan
                  </Text>
                </View>
              )}
              {personalisation && (
                <View className="rounded-full border border-primary/20 bg-accent px-3 py-1">
                  <Text className="text-xs font-medium text-primary">
                    Learned from {personalisation.likedCount} likes ·{' '}
                    {personalisation.dislikedCount} dislikes
                  </Text>
                </View>
              )}
            </View>

            {/* T-06.4: a training day says so, and why the target is what it is. */}
            {selectedTraining && (
              <TrainingDayHeader
                day={selectedTraining}
                isToday={todayIndex === selectedDay}
                onPress={() => setExplainOpen(true)}
              />
            )}
            {preRunDay && <PreRunNote snack={preRunDay.preRunSnack} />}

            {meals.length === 0 ? (
              // T-07.3 (UX-07 §2): a day outside the chosen shape says so and
              // offers to add it via `planDay`. `planned` used to be reliable
              // only right after a generate response; the server now
              // recomputes it from the CURRENT stored shape on every read
              // (wave-1 T-07.6), so this also holds after a plain re-open.
              <Card className="items-center py-8">
                {day?.planned === false ? (
                  <>
                    <Text
                      testID="plan-day-unplanned"
                      variant="muted"
                      className="text-center text-sm"
                    >
                      Not planned — you cook {shape ? planShapeSummary(shape) : 'some days'}.
                    </Text>
                    {!isPast && (
                      <Pressable
                        testID="plan-day-add"
                        accessibilityRole="button"
                        accessibilityLabel={`Plan ${DAY_LABELS[selectedDay]} too`}
                        disabled={planDayMutation.isPending}
                        onPress={() =>
                          planDayMutation.mutate({ planId: plan.planId, dayOfWeek: selectedDay })
                        }
                        className="mt-2 min-h-11 flex-row items-center justify-center px-2"
                      >
                        {planDayMutation.isPending ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <Text className="text-xs font-semibold text-primary">Plan this day</Text>
                        )}
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Text variant="muted">No meals planned for this day.</Text>
                )}
              </Card>
            ) : (
              // A day the chef just replaced fades its new meals in (MO-13,
              // opacity only — instant under Reduce Motion); keyed on the
              // day's recipes so the fade runs exactly when they change.
              <Animated.View
                key={meals.map((m) => m.recipe.id).join(',')}
                entering={
                  updatedDays.has(selectedDay)
                    ? FadeIn.duration(reducedMotion ? 0 : duration.deliberate)
                    : undefined
                }
                className="gap-3"
              >
                {updatedDays.has(selectedDay) && (
                  <Text
                    testID="plan-day-updated"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    {PLAN_TAILORING_COPY.dayUpdated}
                  </Text>
                )}
                {meals.map((meal, slotIndex) => (
                  <PlanMealCard
                    key={`${meal.type}-${slotIndex}`}
                    testID={`plan-meal-${meal.type}`}
                    day={selectedDay}
                    meal={meal}
                    onReport={(recipeId, recipeName) => setReportTarget({ recipeId, recipeName })}
                    trailing={
                      // Replace this meal (all tiers) + toggle "Your pick"
                      // (T-07.4/T-08.3: a pinned slot survives Regenerate).
                      !isPast && (
                        <View className="flex-row">
                          <Pressable
                            testID={`plan-meal-pin-${meal.type}`}
                            accessibilityRole="button"
                            accessibilityLabel={
                              meal.pinned
                                ? `Stop keeping ${meal.recipe.name}`
                                : `Keep ${meal.recipe.name}`
                            }
                            disabled={pinMutation.isPending}
                            onPress={() =>
                              pinMutation.mutate({
                                planId: plan.planId,
                                dayOfWeek: selectedDay,
                                mealType: meal.type,
                                slotIndex,
                                pinned: !meal.pinned,
                              })
                            }
                            className="w-11 items-center justify-center border-l border-border"
                          >
                            <Ionicons
                              name={meal.pinned ? 'bookmark' : 'bookmark-outline'}
                              size={18}
                              color="#944a00"
                            />
                          </Pressable>
                          <Pressable
                            testID={`plan-meal-swap-${meal.type}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Replace ${meal.recipe.name}`}
                            onPress={() =>
                              setPickerTarget({
                                mealType: meal.type,
                                slotIndex,
                                mealName: meal.recipe.name,
                                recipeId: meal.recipe.id,
                              })
                            }
                            className="w-11 items-center justify-center border-l border-border"
                          >
                            <Ionicons name="swap-horizontal-outline" size={18} color="#944a00" />
                          </Pressable>
                        </View>
                      )
                    }
                  />
                ))}
              </Animated.View>
            )}
            {meals.length > 0 && (
              <PlanDayTotals
                meals={meals}
                calorieTarget={targetForDay(selectedDay)}
                proteinGapG={day?.proteinGapG}
                onOpenStatus={isPast ? undefined : () => openMiss(selectedDay)}
              />
            )}
            {/* Advisory disclaimer (2026-10-02): the plan is suggestions, and
                the allergen checks and AI can be wrong. */}
            <Text
              testID="plan-advisory-disclaimer"
              variant="muted"
              className="pt-2 text-center text-xs"
            >
              {WELLNESS_COPY.mealPlanAdvisoryDisclaimer}
            </Text>
          </ScrollView>

          <RecipePickerSheet
            visible={pickerTarget !== null}
            mealName={pickerTarget?.mealName ?? ''}
            // T-08.10 (bug B-50): the picker never re-offers the meal being
            // replaced, and narrows to the slot's type.
            excludeRecipeId={pickerTarget?.recipeId}
            slotType={pickerTarget?.mealType}
            busy={replaceMutation.isPending || swapMutation.isPending}
            error={
              (replaceMutation.error ? userFacingErrorMessage(replaceMutation.error) : undefined) ??
              (swapMutation.error ? userFacingErrorMessage(swapMutation.error) : undefined) ??
              null
            }
            // T-00.11 (B-34/B-46): replaceRecipe rejects an unsafe recipe with
            // FORBIDDEN — the sheet offers "Use anyway" for the user's own.
            unsafeError={replaceMutation.error?.data?.code === 'FORBIDDEN'}
            onSelect={(recipeId, acknowledgeConflict) => {
              if (!pickerTarget) return;
              const target = pickerTarget;
              // Portion at click time — the response carries the new
              // recipe, not the slot's (unchanged) portion (T-08.5).
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
                    const { previousRecipeId } = data;
                    showSnackbar({
                      message: `Swapped to ${data.name}${portion !== 1 ? ` · ${portion}× portion` : ''}`,
                      actionLabel: previousRecipeId ? 'Undo' : undefined,
                      onAction: previousRecipeId
                        ? () => undoSwap(target, previousRecipeId)
                        : undefined,
                    });
                  },
                },
              );
            }}
            onAiSwap={
              isPremium === true
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
                          // T-08.6 (Q-6): commit + Undo, no preview.
                          onSuccess: (data) => {
                            const { previousRecipeId } = data;
                            showSnackbar({
                              message: `Swapped to ${data.name}`,
                              actionLabel: previousRecipeId ? 'Undo' : undefined,
                              onAction: previousRecipeId
                                ? () => undoSwap(target, previousRecipeId)
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

          <WeekSummarySheet
            visible={summaryOpen}
            weekLabel={weekLabel}
            badge={isPast ? 'Past week' : weekOffset === 0 ? 'This week' : 'Next week'}
            days={DAY_LABELS.map((label, i): DaySummary => {
              const dayMeals = plan.days.find((d) => d.dayOfWeek === i)?.meals ?? [];
              return {
                label,
                dayIndex: i,
                mealsCount: dayMeals.length,
                totalKcal: sumPlanDay(dayMeals).kcal,
                isToday: todayIndex === i,
                training: trainingDays.find((t) => t.dayOfWeek === i),
              };
            })}
            dinners={dinnersFromPlan(plan.days, weekdayShortName)}
            weekCostEur={weekCost}
            currency={currency}
            isPast={isPast}
            isPremium={isPremium === true}
            leftovers={leftovers}
            onToggleLeftovers={setLeftovers}
            regenerating={generateMutation.isPending}
            // UX-08 §2: Regenerate always asks now, even from this sheet.
            onRegenerate={openRegenerateConfirm}
            onMyWeeks={() => {
              setSummaryOpen(false);
              router.push('/my-weeks');
            }}
            onSelectDay={(dayIndex) => {
              setSelectedDay(dayIndex);
              setSummaryOpen(false);
            }}
            onClose={() => setSummaryOpen(false)}
          />

          {/* UX-08 §3 (PAT-5): Regenerate always asks; "Keep" defaults on
              and only shows when picks exist. */}
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

          {/* L-SAFE2/T-01.5: long-press on a plan card → same report sheet as
              recipe detail. Its own onSuccess already invalidates
              `mealPlan` and `recipe.list` (utils), which refetches this
              screen's active `getForWeek` query — hides the recipe from
              future plans/replace lists, not from this already-served day. */}
          <ReportSafetySheet
            visible={reportTarget !== null}
            onClose={() => setReportTarget(null)}
            recipeId={reportTarget?.recipeId ?? ''}
            recipeName={reportTarget?.recipeName ?? ''}
            surface="plan_card"
          />

          <TrainingExplainSheet
            visible={explainOpen}
            onClose={() => setExplainOpen(false)}
            days={trainingDays}
            basis={plan.trainingBasis ?? null}
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
          />

          <CompareWeeksSheet
            visible={compareOpen}
            onClose={() => setCompareOpen(false)}
            previousPlanId={lastGenerate?.previousPlanId}
            current={plan}
          />
        </>
      )}

      <PlanSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hasPlan={plan !== null && plan !== undefined}
        weekLabel={weekOffset === 0 ? 'this week' : weekOffset === 1 ? 'next week' : weekLabel}
        isPremium={isPremium === true}
        {...(hasTrainingDays && {
          fitTraining: { value: fitTrainingDays, onChange: setFitTrainingPref },
        })}
        onSaved={() => {
          void utils.mealPlan.getShape.invalidate();
          // A plan already exists for this week — the settings change needs
          // its own regenerate confirm (interaction spec: settings never
          // regenerate by themselves).
          if (plan) openRegenerateConfirm();
        }}
      />
    </Screen>
  );
}
