'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { DayView, TailoringDayMark } from '@/features/meal-plan/components/day-view';
import { DayRecapBar } from '@/features/meal-plan/components/DayRecapBar';
import { GenerateOverlay } from '@/features/meal-plan/components/GenerateOverlay';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { PlanMissSheet } from '@/features/meal-plan/components/PlanMissSheet';
import { PlanSettingsSheet } from '@/features/meal-plan/components/PlanSettingsSheet';
import {
  PremiumChangesCard,
  type PremiumChangesData,
} from '@/features/meal-plan/components/PremiumChangesCard';
import { RebalanceBanner } from '@/features/meal-plan/components/RebalanceBanner';
import {
  ReplaceMealSheet,
  type ReplaceMealResult,
  type ReplaceTarget,
} from '@/features/meal-plan/components/ReplaceMealSheet';
import { TailoringBanner } from '@/features/meal-plan/components/TailoringBanner';
import {
  PreRunNote,
  preRunNoteFor,
  TrainingDayHeader,
  TrainingGlyph,
} from '@/features/meal-plan/components/TrainingDayHeader';
import { TrainingExplainSheet } from '@/features/meal-plan/components/TrainingExplainSheet';
import { useTailoringWatch } from '@/features/meal-plan/hooks/use-tailoring-watch';
import {
  dismissReplan,
  isReplanDismissed,
  missDirection,
  targetDrifted,
} from '@/features/meal-plan/plan-miss';
import { PantryUsageBanner } from '@/features/pantry/components/PantryUsageBanner';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { UpgradeNudge } from '@/features/premium/components/UpgradeNudge';
import type { ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useHousehold } from '@/hooks/useHousehold';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useRecipeImageStream, type RecipeImageUpdate } from '@/hooks/useRecipeImageStream';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Dumbbell,
  ImageIcon,
  RefreshCw,
  Repeat,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wand2,
} from 'lucide-react';
import { PLAN_TAILORING_POLL_MS } from '@chefer/types';
import { ErrorState, Sheet, Toast } from '@chefer/ui';
import {
  aiConsentRequiredFor,
  defaultWeekOffset,
  formatMoney,
  formatPriceRange,
  getWeekStartDate,
  isTailoringRunning,
  perPortionCost,
  planButtonLabel,
  planShapeSummary,
  SAFETY_COPY,
  sumPlanDay,
  tailoringDayLabel,
  tailoringDayState,
  toDisplayCurrency,
  trainingDaysChip,
  trainingKindLabel,
} from '@chefer/utils';
import MealPlanLoading from './loading';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStartDate: Date): string {
  const start = new Date(weekStartDate);
  const end = new Date(weekStartDate);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

/** Returns 0=Monday … 6=Sunday for today, matching dayOfWeek in the plan. */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon … 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MealPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // T-08.9 (UX-08 AC1): no `?week` in the URL yet defaults to next week from
  // Friday 15:00 to Sunday 23:59 local, else this week — the same
  // `defaultWeekOffset` mobile's Plan/Shop share (@chefer/utils). An
  // explicit `?week=0` (e.g. the nav arrows) is never overridden.
  const weekParam = searchParams.get('week');
  const rawOffset = weekParam === null ? defaultWeekOffset(new Date()) : parseInt(weekParam, 10);
  const weekOffset = Number.isNaN(rawOffset)
    ? 0
    : Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, rawOffset));

  const setWeekOffset = (offset: number) => {
    const params = new URLSearchParams(searchParams.toString());
    // T-08.9: `week` is always written explicitly, even for 0 — deleting it
    // on "this week" used to mean the NEXT render recomputed the default
    // (possibly next week again, e.g. Friday afternoon) instead of staying
    // on the week the arrows just navigated to.
    params.set('week', String(offset));
    router.replace(`/meal-plan?${params.toString()}`, { scroll: false });
  };

  // Which day the mobile view shows. Kept in the URL alongside `week` so back,
  // forward and refresh all land on the day the user was actually looking at.
  const rawDay = parseInt(searchParams.get('day') ?? '', 10);
  const todayIndex = getTodayDayIndex();
  const selectedDay = Number.isNaN(rawDay) || rawDay < 0 || rawDay > 6 ? todayIndex : rawDay;

  const setSelectedDay = (day: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('day', String(day));
    router.replace(`/meal-plan?${params.toString()}`, { scroll: false });
  };

  const hasMounted = useHasMounted();
  const isPremium = useIsPremium();
  const [isGenerating, setIsGenerating] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);
  const [imageOverrides, setImageOverrides] = useState<
    Record<string, { imageUrl: string | null; status: ImageStatusType }>
  >({});
  // T-07.6: the shared "how you cook" plan settings sheet.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // T-08.9 (UX-08 §3, PAT-5): Regenerate always asks first.
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [keepPicks, setKeepPicks] = useState(true);
  // Snapshot of how many picks existed when Regenerate was confirmed — the
  // toast's "Kept N of your picks" needs the BEFORE count; `plan` itself has
  // already been replaced by the time the mutation resolves.
  const [pinnedBeforeRegenerate, setPinnedBeforeRegenerate] = useState(0);
  // One toast slot for regenerate/replace/swap/plan-day undo (T-08.3/T-08.5/
  // T-08.6) — mirrors the recipe detail page's existing swap-undo Toast.
  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);

  const isPast = weekOffset < 0;
  const isCurrent = weekOffset === 0;

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
      // Live tailoring (premium instant week): poll while the chef is still
      // working — and only then. React Query pauses the interval while the
      // tab is hidden (refetchIntervalInBackground defaults to false).
      refetchInterval: (query) =>
        isTailoringRunning(query.state.data?.tailoring) ? PLAN_TAILORING_POLL_MS : false,
    },
  );
  // A failed load is not an empty week: never offer "Generate" over a plan we
  // simply couldn't fetch (audit F-X-3-1, F-PLAN-1-4).
  const loadFailed = isError && !plan;

  // B-13 (T-00.15): confirms the server sent the WEEK actually asked for —
  // a monitoring signal for the "next week shown as this week" bug class,
  // not just this one fix. No-op until the analytics transport lands
  // (wave 1); `capture` already drops events until then (see lib/analytics).
  useEffect(() => {
    if (isLoading) return;
    const expected = getWeekStartDate(weekOffset).toDateString();
    const weekMatches = !plan || new Date(plan.weekStartDate).toDateString() === expected;
    capture('plan_shown', { surface: 'plan', weekMatches });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per load, not on every render
  }, [plan?.planId, plan?.weekStartDate, isLoading, weekOffset]);

  // Week cost + budget (P2-4). Every tier sees the cost; the budget is a
  // premium preference and simply comes back null for free users.
  const { data: prefs } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const weekCost = plan?.estimatedCost?.totalEur ?? null;
  const weeklyBudget = prefs?.chefProfile?.weeklyBudgetEur ?? null;
  // Costs are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = toDisplayCurrency(prefs?.chefProfile?.deliveryCurrency);
  // Honest per-person cost (P2-3, audit F-PM-5): divide by the portions the
  // cost was SIZED for (premium households — the API scales the week to the
  // table), never a single-portion total by the head count. A free table's
  // cost is for one portion and says so.
  const { memberCount } = useHousehold();
  const costPortions = plan?.estimatedCost?.portions ?? null;
  const perPortion = perPortionCost(weekCost, costPortions);
  const overBudget =
    weekCost !== null && weeklyBudget !== null && weekCost > weeklyBudget
      ? Math.round((weekCost - weeklyBudget) * 100) / 100
      : null;

  // Collect pending recipe IDs for SSE subscription
  const pendingRecipeIds = useMemo(
    () =>
      plan
        ? plan.days
            .flatMap((d) => d.meals)
            .map((m) => m.recipe)
            .filter((r) => {
              const imageStatus = r.imageStatus ?? 'DONE';
              return imageStatus === 'PENDING' || imageStatus === 'GENERATING';
            })
            .map((r) => r.id)
        : [],
    [plan],
  );

  const handleImageUpdate = useCallback((update: RecipeImageUpdate) => {
    setImageOverrides((prev) => ({
      ...prev,
      [update.recipeId]: { imageUrl: update.imageUrl, status: update.status },
    }));
  }, []);

  // On SSE timeout, refetch real statuses from the DB instead of faking
  // failures — still-pending recipes re-open a fresh subscription.
  const handleStreamTimeout = useCallback(() => {
    void refetch();
  }, [refetch]);

  useRecipeImageStream(pendingRecipeIds, handleImageUpdate, handleStreamTimeout);

  // Photo generation progress (drives the pill next to Regenerate).
  // The batch size is LATCHED per plan (review 5.4): pendingRecipeIds shrinks
  // whenever a refetch returns recipes already DONE, which made the pill
  // count backwards ("1 of 17" → "0 of 11" → "0 of 8"). Total only grows for
  // a given plan; ready = total − still unresolved.
  const [photoBatch, setPhotoBatch] = useState<{ planId: string | null; total: number }>({
    planId: null,
    total: 0,
  });
  useEffect(() => {
    const planId = plan?.planId ?? null;
    setPhotoBatch((prev) =>
      prev.planId === planId
        ? prev.total >= pendingRecipeIds.length
          ? prev
          : { planId, total: pendingRecipeIds.length }
        : { planId, total: pendingRecipeIds.length },
    );
  }, [plan?.planId, pendingRecipeIds.length]);
  const stillPendingCount = pendingRecipeIds.filter((id) => !imageOverrides[id]).length;
  const photosTotal = photoBatch.planId === (plan?.planId ?? null) ? photoBatch.total : 0;
  const photosReady = Math.max(0, photosTotal - stillPendingCount);
  const photosInProgress = photosTotal > 0 && stillPendingCount > 0;

  // PRECONDITION_FAILED = the free curated pool can't satisfy the user's
  // restrictions (P1-2). That's an upgrade moment, not an error dialog.
  // T-10.4: `null` = not exhausted; the string is the API's structured detail
  // (may be empty) shown under the card's fixed headline.
  const [poolExhausted, setPoolExhausted] = useState<{ detail: string | null } | null>(null);
  // Generation failures render inline with a retry, not as a native alert()
  // with raw transport text (audit F-PLAN-1-5, F-PM-2).
  const [generateError, setGenerateError] = useState<string | null>(null);

  // What the last generation learned from (P1-1) — the learning has to be
  // VISIBLE or users won't believe the plan adapts to their ratings.
  const [personalisation, setPersonalisation] = useState<{
    pinnedDishNames: string[];
    likedCount: number;
    dislikedCount: number;
    usedPantryItems?: string[];
  } | null>(null);

  // F3 "cook once, eat twice" generation option (premium): pairs dinners with
  // next-day leftover lunches. Plain state — remembered per visit, not stored.
  const [leftovers, setLeftovers] = useState(false);
  // T-06.8: premium `Fit meals to my training days` — a per-generation option,
  // on by default (the API's own default for lifters).
  const [fitTraining, setFitTraining] = useState(true);
  const [generated, setGenerated] = useState<{
    planId: string;
    previousPlanId: string | undefined;
    fitTrainingDays: boolean;
    premiumChanges: PremiumChangesData | undefined;
  } | null>(null);
  const [trainingExplainOpen, setTrainingExplainOpen] = useState(false);
  // T-11.3: the day whose plan-miss sheet is open.
  const [missDay, setMissDay] = useState<number | null>(null);

  // T-08.3: restores the plan `generate` just replaced (exact same recipes
  // and portions) — offered as Undo on the regenerate toast below.
  const restoreMutation = trpc.mealPlan.restore.useMutation({
    onSuccess: () => {
      void refetch();
      capture('regenerate_undone');
    },
  });

  const generateMutation = trpc.mealPlan.generate.useMutation({
    onMutate: () => {
      setIsGenerating(true);
      setPoolExhausted(null);
      setGenerateError(null);
      setPersonalisation(null);
      setGenerated(null);
    },
    onSettled: () => setIsGenerating(false),
    onSuccess: (data) => {
      capture('plan_generated', { tier: isPremium ? 'premium' : 'free', weekOffset });
      setPersonalisation(data.personalisation ?? null);
      // T-06.8 / T-10.7: what this generation was built around, and (premium
      // regenerations) what it changed — read once from the response.
      setGenerated({
        planId: data.planId,
        previousPlanId: data.previousPlanId,
        fitTrainingDays: data.fitTrainingDays === true,
        premiumChanges: data.premiumChanges,
      });
      setRegenerateConfirmOpen(false);
      void refetch();
      // T-08.3 (UX-08 §3): only a regeneration (a plan already existed for
      // this week) gets the "New week planned" toast + Undo.
      const { previousPlanId } = data;
      if (previousPlanId) {
        const keptCount =
          data.droppedPinned !== undefined
            ? Math.max(0, pinnedBeforeRegenerate - data.droppedPinned)
            : 0;
        const keptNote = keptCount > 0 ? ` Kept ${keptCount} of your picks.` : '';
        setToast({
          message: `New week planned.${keptNote}`,
          action: {
            label: 'Undo',
            onClick: () => restoreMutation.mutate({ planId: previousPlanId }),
          },
        });
      }
    },
    onError: (err) => {
      if (err.data?.code === 'PRECONDITION_FAILED') {
        capture('pool_exhausted');
        // T-10.4: the structured cause (`error.data.poolExhausted`) isn't
        // wired through `trpc.ts`'s errorFormatter on this branch yet (not
        // owned by this lane) — read it defensively so the richer copy
        // appears the moment the orchestrator wires it, with no crash
        // meanwhile (mirrors the mobile Plan tab's same read).
        const cause = (err.data as { poolExhausted?: { message?: string } } | undefined)
          ?.poolExhausted;
        setPoolExhausted({ detail: cause?.message ?? null });
      } else {
        setGenerateError(
          err.data?.code === 'TOO_MANY_REQUESTS'
            ? err.message
            : "We couldn't generate your plan just now. Please try again in a moment.",
        );
      }
    },
  });

  // AI data consent (App Store 5.1.2(i)): premium generation sends the
  // profile to the AI provider; free generation is curated and never asks.
  const requestAiConsent = useAiConsent();
  const generateWithConsent = (input: {
    weekOffset: number;
    leftovers?: true;
    keepPinned?: boolean;
    fitTrainingDays?: boolean;
  }) =>
    requestAiConsent('meal-plan', () => generateMutation.mutate(input), {
      usesAi: aiConsentRequiredFor('meal-plan', isPremium),
    });

  // Premium sends the training-day switch explicitly; free never does.
  const fitTrainingInput = isPremium ? { fitTrainingDays: fitTraining } : {};
  const handleGenerate = () =>
    generateWithConsent({
      weekOffset,
      ...(leftovers && { leftovers: true as const }),
      ...fitTrainingInput,
    });

  // T-07.6/T-08.9: the "how you cook" shape names the empty-week job and
  // feeds the unplanned-day line — same query mobile's Plan tab uses.
  const { data: shape } = trpc.mealPlan.getShape.useQuery();
  const planShapeSummaryText = shape ? planShapeSummary(shape) : '';

  // T-11.3: the live effective target (and goal) — the re-plan banner compares
  // it with what this week was planned for; the miss sheet reads the goal.
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const goal = targetsView?.inputs.goal;
  const [replanDismissedFor, setReplanDismissedFor] = useState<string | null>(null);

  const pinnedCount = plan?.days.flatMap((d) => d.meals).filter((m) => m.pinned).length ?? 0;
  const plannedMealsCount = plan?.days.flatMap((d) => d.meals).length ?? 0;

  // Visible under the week nav — always asks first (UX-08 §3).
  const openRegenerateConfirm = () => {
    setKeepPicks(true);
    setPinnedBeforeRegenerate(pinnedCount);
    setRegenerateConfirmOpen(true);
  };

  const utils = trpc.useUtils();

  // T-11.3: a day's target (its training bump when applied) and what is planned.
  const missFor = (dayOfWeek: number) => {
    const day = plan?.days.find((d) => d.dayOfWeek === dayOfWeek);
    const training = plan?.trainingDays?.find((t) => t.dayOfWeek === dayOfWeek);
    const target =
      training?.applied && training.targetKcal !== undefined
        ? training.targetKcal
        : plan?.calorieTarget;
    if (!day || !target || day.meals.length === 0) return null;
    const kcal = Math.round(sumPlanDay(day.meals).kcal);
    return { day, kcal, target, direction: missDirection(kcal, target) };
  };
  // `Add a snack`: a curated day may already hold a snack slot (swap it for a
  // bigger one); otherwise the snack is logged in the tracker — the plan has no
  // add-a-slot procedure.
  const handleAddSnack = (dayOfWeek: number) => {
    const day = plan?.days.find((d) => d.dayOfWeek === dayOfWeek);
    const slotIndex = day?.meals.findIndex((m) => m.type === 'snack') ?? -1;
    const slot = slotIndex >= 0 ? day?.meals[slotIndex] : undefined;
    if (plan && slot) {
      setReplaceTarget({
        planId: plan.planId,
        dayOfWeek,
        mealType: 'snack',
        slotIndex,
        mealName: slot.recipe.name,
        recipeId: slot.recipe.id,
      });
    } else {
      router.push('/tracker');
    }
  };
  // Live tailoring: which days the chef just replaced (brief highlight) and
  // whether the user watched it run (the DONE confirmation). A replaced day
  // changes the shopping list and today's totals too.
  const { sawRunning, updatedDays } = useTailoringWatch(plan?.planId, plan?.tailoring, () => {
    void utils.shoppingList.invalidate();
    void utils.dashboard.invalidate();
  });
  const resumeTailoringMutation = trpc.mealPlan.resumeTailoring.useMutation({
    onSuccess: () => void refetch(),
    onError: (err) => setToast({ message: err.message }),
  });
  const resumeTailoring = () => {
    if (!plan) return;
    const planId = plan.planId;
    requestAiConsent('meal-plan', () => resumeTailoringMutation.mutate({ planId }), {
      usesAi: true,
    });
  };
  const pinMutation = trpc.mealPlan.setSlotPinned.useMutation({ onSuccess: () => void refetch() });
  // T-08.5/T-08.6 Undo: replaceRecipe back to `previousRecipeId` — used by
  // the swap/replace toast's Undo action (the sheet itself is closed by then).
  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    onSuccess: () => void refetch(),
  });

  const [planningDay, setPlanningDay] = useState<number | null>(null);
  const planDayMutation = trpc.mealPlan.planDay.useMutation({
    onMutate: (input) => setPlanningDay(input.dayOfWeek),
    onSettled: () => setPlanningDay(null),
    onSuccess: (_data, input) => {
      capture('plan_day_filled', { dayOfWeek: input.dayOfWeek });
      void refetch();
      setToast({ message: `${DAY_NAMES[selectedDay]} planned.` });
    },
    onError: (err) => setToast({ message: err.message }),
  });

  // ?generate=1 (dashboard's "Generate My Week", prod-followups #9): start
  // generation on arrival when the week has no plan yet. Fires at most once
  // and strips the param immediately so a reload can't double-generate.
  const autoGenerateFired = useRef(false);
  const wantsAutoGenerate = searchParams.get('generate') === '1';
  useEffect(() => {
    if (!wantsAutoGenerate || autoGenerateFired.current || isLoading) return;
    autoGenerateFired.current = true;
    router.replace('/meal-plan', { scroll: false });
    if (!plan && !isGenerating) generateWithConsent({ weekOffset });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire-once trigger keyed on load completion
  }, [wantsAutoGenerate, isLoading]);

  // Everything below reads client-only state: react-query data (which may
  // already be resolved when this lazily-hydrated boundary hydrates — the
  // #418 bug) and `new Date()` (server timezone ≠ client timezone near
  // midnight). The server can never render more than the pending state, so
  // render exactly the loading fallback until mounted — SSR HTML and the
  // hydration pass stay byte-identical.
  if (!hasMounted) return <MealPlanLoading />;

  // ── Navigation bar (always visible) ───────────────────────────────────────
  // Always derive label from weekOffset so it updates instantly on click,
  // regardless of whether a plan has loaded yet.
  const weekLabel = formatWeekLabel(getWeekStartDate(weekOffset));

  const weekArrowCls =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

  const trainingCount = plan?.trainingDays?.length ?? 0;
  const trainingChip = trainingDaysChip(trainingCount);
  const replanVisible =
    !isPast &&
    plan !== null &&
    plan !== undefined &&
    targetDrifted(plan.calorieTarget, targetsView?.effective.dailyCalorieTarget) &&
    replanDismissedFor !== plan.planId &&
    !isReplanDismissed(plan.planId);
  const premiumChanges =
    plan && generated?.planId === plan.planId ? generated.premiumChanges : undefined;
  // "Pick recipes yourself" reuses the replace flow when the week already has a
  // meal to change; with no plan there is nothing to replace, so it browses recipes.
  const firstPlannedDay = plan?.days.find((d) => d.meals.length > 0);
  const firstPlannedMeal = firstPlannedDay?.meals[0];
  const pickFirstMeal: ReplaceTarget | null =
    plan && firstPlannedDay && firstPlannedMeal
      ? {
          planId: plan.planId,
          dayOfWeek: firstPlannedDay.dayOfWeek,
          mealType: firstPlannedMeal.type,
          slotIndex: 0,
          mealName: firstPlannedMeal.recipe.name,
          recipeId: firstPlannedMeal.recipe.id,
        }
      : null;
  const openMiss = isPast ? undefined : (dayOfWeek: number) => setMissDay(dayOfWeek);

  const navBar = (
    <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
      {/* Week navigator */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setWeekOffset(Math.max(MIN_OFFSET, weekOffset - 1))}
          disabled={weekOffset <= MIN_OFFSET}
          aria-label="Previous week"
          className={weekArrowCls}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Flexes instead of a 200px floor, which overflowed once the status
            pill was alongside it. */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:flex-none sm:basis-[200px]">
          <CalendarDays className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-gray-700">{weekLabel}</span>
          {isPast && (
            <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-600 sm:inline">
              Past
            </span>
          )}
          {isCurrent && (
            <span className="hidden shrink-0 rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#944a00] sm:inline">
              This Week
            </span>
          )}
          {weekOffset > 0 && (
            <span className="hidden shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-600 sm:inline">
              Next Week
            </span>
          )}
        </div>

        <button
          onClick={() => setWeekOffset(Math.min(MAX_OFFSET, weekOffset + 1))}
          disabled={weekOffset >= MAX_OFFSET}
          aria-label="Next week"
          className={weekArrowCls}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Actions — only available for current/future weeks */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Plans continue week to week until changed — hint when this week
            was just materialized from the previous plan */}
        {plan?.carriedOver && (
          <span
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
            title="This week started as a copy of your previous plan — edit any meal to tailor it"
          >
            Continued from your last plan
          </span>
        )}
        {/* PAT-2 week card (UX-02 §3, T-02.2): the table has ≥ 1 safety rule
            checked against this week's plan. */}
        {plan?.tableSafety?.hasRules && (
          <span className="flex items-center gap-1 rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-medium text-[#944a00]">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {SAFETY_COPY.weekCardTitle}
          </span>
        )}
        {/* Estimated week cost (P2-4) — the priced-list wedge, on the plan */}
        {weekCost !== null && (
          <span
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
              overBudget !== null
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
            title="Estimated ingredient cost for the whole week"
          >
            <Wallet className="h-3 w-3" aria-hidden="true" />≈{' '}
            {formatPriceRange(weekCost, currency) ?? formatMoney(weekCost, currency)} this week
            {perPortion !== null && costPortions !== null && (
              <span className="font-normal opacity-80">
                · {formatMoney(perPortion, currency)}/portion · {costPortions} portions
              </span>
            )}
            {costPortions === null && memberCount > 0 && (
              <span
                className="font-normal opacity-80"
                title="Premium sizes the list and cost for your whole table"
              >
                · for 1 portion
              </span>
            )}
          </span>
        )}

        {/* T-06.8: how many days this week are training days */}
        {trainingChip && (
          <span
            data-testid="plan-training-chip"
            className="flex items-center gap-1 rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-medium text-[#944a00]"
          >
            <Dumbbell className="h-3 w-3" aria-hidden="true" />
            {trainingChip}
          </span>
        )}

        {/* T-10.4 (D-7): the household week-1 line under the cost chip */}
        {plan?.firstScaledWeek && (
          <p
            data-testid="plan-first-scaled-week"
            className="basis-full text-xs text-gray-600 sm:text-right"
          >
            Sized for your table of {costPortions ?? memberCount} — free for your first week
          </p>
        )}

        {/* Photo generation progress */}
        {photosInProgress && (
          <span className="flex items-center gap-1.5 rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-medium text-[#944a00]">
            <ImageIcon className="h-3 w-3 animate-pulse" />
            {photosReady} of {photosTotal} photos ready
          </span>
        )}

        {/* F3 "cook once, eat twice" toggle — premium generation option */}
        {!isPast && !loadFailed && isPremium && (
          <button
            type="button"
            onClick={() => setLeftovers((v) => !v)}
            aria-pressed={leftovers}
            title="Pair dinners with next-day leftover lunches (doubled servings)"
            className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors sm:min-h-0 ${
              leftovers
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <CookingPot className="h-3.5 w-3.5" aria-hidden="true" />
            Cook once, eat twice
          </button>
        )}

        {/* T-07.6: opens the shared "how you cook" plan settings sheet. */}
        {!isPast && (
          <button
            type="button"
            data-testid="plan-settings-open"
            onClick={() => setSettingsOpen(true)}
            aria-label="Plan settings"
            title="Plan settings — how you cook"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 sm:h-auto sm:w-auto sm:min-h-0 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs sm:font-medium"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Plan settings</span>
          </button>
        )}

        {/* Hidden while the week failed to load — "Generate" would overwrite
            a plan we simply couldn't fetch (F-X-3-1). T-08.9 (UX-08 §3):
            once a plan exists, Regenerate always asks first — nothing to
            lose on an empty week, so that one still generates directly. */}
        {!isPast && !loadFailed && (
          <button
            data-testid="plan-regenerate"
            onClick={() => (plan ? openRegenerateConfirm() : handleGenerate())}
            disabled={isGenerating}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 sm:min-h-0 sm:flex-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            {plan ? 'Regenerate' : shape ? planButtonLabel(shape) : 'Generate'}
          </button>
        )}
      </div>
    </div>
  );

  // ── Always render navBar; swap only the body area ─────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* The shell header shows the page name visually; this is the page's
          one <h1> for screen-reader heading navigation (F-X-5-3). */}
      <h1 className="sr-only">Meal planner</h1>
      {navBar}

      {/* §6.5 Monday nudge: free user opening a week that has no plan yet —
          premium members woke up to one (PW-5). Mount-gated so the nudge
          cap's daily slot is only consumed on the actual trigger moment. */}
      {isPremium === false &&
        isCurrent &&
        !isLoading &&
        !loadFailed &&
        !plan &&
        new Date().getDay() === 1 && (
          <UpgradeNudge
            source="monday-nudge"
            message="Premium members woke up to a fresh week today."
            className="mx-4 mb-2 sm:mx-6"
          />
        )}

      {/* Live tailoring: the week is usable now; the chef finishes it day by day */}
      {plan && !isPast && (
        <TailoringBanner
          className="mx-4 mb-2 sm:mx-6"
          tailoring={plan.tailoring}
          sawRunning={sawRunning}
          onResume={isPremium && plan.tailoring?.canResume ? resumeTailoring : undefined}
          resuming={resumeTailoringMutation.isPending}
        />
      )}

      {/* Learning signals used by the last generation (P1-1) */}
      {personalisation &&
        (personalisation.pinnedDishNames.length > 0 ||
          personalisation.likedCount + personalisation.dislikedCount > 0) && (
          <div className="mx-4 mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 sm:mx-6">
            <p className="flex items-start gap-2 text-xs text-emerald-900">
              <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>
                Built for you
                {personalisation.likedCount + personalisation.dislikedCount > 0 && (
                  <>
                    {' '}
                    from{' '}
                    <strong>
                      {personalisation.likedCount + personalisation.dislikedCount} dish
                      {personalisation.likedCount + personalisation.dislikedCount === 1
                        ? ''
                        : 'es'}{' '}
                      you rated
                    </strong>
                  </>
                )}
                {personalisation.pinnedDishNames.length > 0 && (
                  <>
                    {personalisation.likedCount + personalisation.dislikedCount > 0
                      ? ' and '
                      : ' with '}
                    <strong>
                      {personalisation.pinnedDishNames.length} pinned favourite
                      {personalisation.pinnedDishNames.length === 1 ? '' : 's'}
                    </strong>{' '}
                    ({personalisation.pinnedDishNames.join(', ')})
                  </>
                )}
                .
              </span>
            </p>
          </div>
        )}

      {/* F3: "uses N things you already have" — fires plan_used_pantry itself */}
      {personalisation?.usedPantryItems && personalisation.usedPantryItems.length > 0 && (
        <div className="mx-4 mb-2 sm:mx-6">
          <PantryUsageBanner usedPantryItems={personalisation.usedPantryItems} />
        </div>
      )}

      {/* Week-rebalance banner (F4 Snap-to-Log): what the chef adjusted + undo */}
      {isCurrent && plan && (
        <div className="mx-4 sm:mx-6">
          <RebalanceBanner planId={plan.planId} onUndone={() => void refetch()} />
        </div>
      )}

      {/* T-06.8: this week was built around the routine's training days */}
      {generated?.fitTrainingDays && plan?.planId === generated.planId && (
        <p
          data-testid="plan-fit-training-note"
          className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 sm:mx-6"
        >
          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          Your week is built around your training days
        </p>
      )}

      {/* T-10.7: what Premium changed (premium regeneration, once per plan) */}
      {plan && premiumChanges && (
        <PremiumChangesCard
          key={plan.planId}
          planId={plan.planId}
          previousPlanId={generated?.previousPlanId}
          changes={premiumChanges}
          currentDays={plan.days}
          onFix={(dayOfWeek) => {
            setSelectedDay(dayOfWeek);
            setMissDay(dayOfWeek);
          }}
          className="mx-4 mb-2 sm:mx-6"
        />
      )}

      {/* T-11.3: the plan was made for a different target than today's */}
      {replanVisible && targetsView && (
        <div
          data-testid="plan-replan-banner"
          className="mx-4 mb-2 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        >
          <p className="text-sm text-gray-800">
            This week was planned for {(plan.calorieTarget ?? 0).toLocaleString('en-US')} kcal.
            Re-plan with {targetsView.effective.dailyCalorieTarget.toLocaleString('en-US')} kcal?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="plan-replan"
              onClick={openRegenerateConfirm}
              className="min-h-11 flex-1 rounded-lg bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] sm:flex-none"
            >
              Re-plan
            </button>
            <button
              type="button"
              data-testid="plan-replan-keep"
              onClick={() => {
                dismissReplan(plan.planId);
                setReplanDismissedFor(plan.planId);
              }}
              className="min-h-11 flex-1 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:flex-none"
            >
              Keep
            </button>
          </div>
        </div>
      )}

      {/* Over-budget warning (P2-4) */}
      {overBudget !== null && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 sm:mx-6">
          <p className="flex items-start gap-2 text-xs text-amber-900">
            <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            This week comes to ≈ {formatMoney(weekCost ?? 0, currency)} — about{' '}
            {formatMoney(overBudget, currency)} over your{' '}
            {formatMoney(weeklyBudget ?? 0, currency, { decimals: 0 })} budget. Regenerate for a
            cheaper week, or raise the budget in Preferences.
          </p>
        </div>
      )}

      {generateError && (
        <div
          role="alert"
          className="mx-4 mb-2 flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        >
          <p className="text-sm text-red-800">{generateError}</p>
          <button
            type="button"
            onClick={handleGenerate}
            className="min-h-11 shrink-0 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* T-10.4: the free pool can't cover these restrictions — two honest
          ways forward: pick recipes yourself, or Premium builds around them. */}
      {poolExhausted && (
        <div
          data-testid="plan-pool-exhausted"
          className="mx-4 mb-2 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:mx-6"
        >
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span className="min-w-0">
              Our recipes can’t fill this week around your restrictions.
              {poolExhausted.detail && (
                <span className="mt-1 block text-xs text-amber-800">{poolExhausted.detail}</span>
              )}
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {pickFirstMeal ? (
              <button
                type="button"
                data-testid="plan-pool-pick"
                onClick={() => setReplaceTarget(pickFirstMeal)}
                className="flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Pick recipes yourself
              </button>
            ) : (
              <Link
                href="/recipes"
                data-testid="plan-pool-pick"
                className="flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Pick recipes yourself
              </Link>
            )}
            <UpgradeButton
              className="w-full sm:w-auto"
              source="pool-exhaustion"
              label="Premium builds a plan around them"
            />
          </div>
        </div>
      )}

      {/* Free-tier hint — generic plans, upgrade for personalisation */}
      {isPremium === false && (
        <div className="mx-4 mb-2 flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="flex items-start gap-2 text-xs text-amber-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            You&apos;re on the free plan: chef-picked recipes that respect your allergies and
            restrictions. Premium generates your week from your goals and preferences.
          </p>
          <UpgradeButton className="w-full sm:w-auto sm:shrink-0" source="meal-plan-banner" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
        </div>
      )}

      {loadFailed && (
        <div className="px-4 py-6 sm:px-6">
          <ErrorState
            title="Couldn't load your meal plan"
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadFailed && !plan && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fff3e8] text-4xl">
            🍽️
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isPast ? 'No plan for this week' : 'No meal plan yet'}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              {isPast
                ? 'No meal plan was created for this week.'
                : 'Generate a personalised 7-day plan based on your goals and dietary preferences.'}
            </p>
          </div>
          {!isPast && (
            <button
              data-testid="plan-generate-empty"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-xl bg-[#944a00] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              {/* T-07.6 (UX-07 AC3): names the job, e.g. "Plan 4 dinners". */}
              {shape ? planButtonLabel(shape) : 'Generate my meal plan'}
            </button>
          )}
        </div>
      )}

      {/* ── Mobile: one day at a time. pb-20 clears the chat FAB, which
          otherwise floats over the last card's macros (review M-2). ── */}
      {!isLoading && plan && (
        <div className="px-4 pb-20 lg:hidden">
          <DayView
            days={plan.days}
            planId={plan.planId}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            todayIndex={isCurrent ? todayIndex : null}
            weekStartDate={getWeekStartDate(weekOffset)}
            readOnly={isPast}
            imageOverrides={imageOverrides}
            calorieTarget={plan.calorieTarget}
            planShapeSummary={planShapeSummaryText}
            onPlanDay={
              !isPast
                ? (dayOfWeek) => planDayMutation.mutate({ planId: plan.planId, dayOfWeek })
                : undefined
            }
            planDayPending={planDayMutation.isPending && planningDay === selectedDay}
            tailoring={plan.tailoring}
            updatedDays={updatedDays}
            trainingDays={plan.trainingDays}
            onOpenTrainingExplain={() => setTrainingExplainOpen(true)}
            onOpenMiss={openMiss}
            onTogglePin={
              !isPast
                ? (mealType, slotIndex, pinned) =>
                    pinMutation.mutate({
                      planId: plan.planId,
                      dayOfWeek: selectedDay,
                      mealType: mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                      slotIndex,
                      pinned,
                    })
                : undefined
            }
            onReplaceMeal={(mealType, mealName, slotIndex, recipeId) =>
              setReplaceTarget({
                planId: plan.planId,
                dayOfWeek: selectedDay,
                mealType,
                slotIndex,
                mealName,
                recipeId,
              })
            }
          />
        </div>
      )}

      {/* ── Desktop: the full week grid ────────────────────────────────────── */}
      {!isLoading && plan && (
        <div className="hidden flex-1 overflow-x-auto px-4 pb-6 lg:block">
          <div className="grid min-w-[900px] grid-cols-7 gap-3">
            {plan.days.map((day) => {
              const isToday = isCurrent && day.dayOfWeek === todayIndex;
              const tailorState = tailoringDayState(plan.tailoring, day.dayOfWeek);
              const tailorLabel = tailoringDayLabel(tailorState);
              const justUpdated = updatedDays.has(day.dayOfWeek);
              const training = plan.trainingDays?.find((t) => t.dayOfWeek === day.dayOfWeek);
              const preRun = preRunNoteFor(plan.trainingDays, day.dayOfWeek);
              const dayTarget =
                training?.applied && training.targetKcal !== undefined
                  ? training.targetKcal
                  : plan.calorieTarget;
              return (
                <div key={day.dayOfWeek} className="flex flex-col gap-2">
                  {/* Day header — fixed height so all headers are the same size */}
                  <div
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center transition-colors ${
                      isToday ? 'bg-[#944a00] shadow-sm' : 'bg-gray-100'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-700'}`}
                    >
                      {DAY_NAMES[day.dayOfWeek]}
                    </p>
                    {training && (
                      <>
                        <TrainingGlyph
                          kind={training.kind}
                          className={isToday ? 'text-white' : 'text-[#944a00]'}
                        />
                        <span className="sr-only">
                          , {trainingKindLabel(training.kind).toLowerCase()}
                        </span>
                      </>
                    )}
                    {isToday && (
                      <span className="rounded-full bg-white/25 px-1.5 py-px text-xs font-semibold uppercase tracking-wide text-white">
                        Today
                      </span>
                    )}
                    <TailoringDayMark state={tailorState} onDark={isToday} />
                    {tailorLabel && <span className="sr-only">, {tailorLabel}</span>}
                  </div>

                  {/* Column highlight wrapper for today */}
                  <div
                    // A day the chef just replaced fades its new meals in
                    // (MO-13 crossfade: opacity only; the global
                    // reduced-motion rule makes it instant).
                    key={day.meals.map((m) => m.recipe.id).join(',')}
                    data-testid={justUpdated ? `plan-day-updated-${day.dayOfWeek}` : undefined}
                    className={`flex flex-col gap-2 rounded-xl p-1 ${
                      isToday ? 'bg-[#944a00]/10 ring-2 ring-[#944a00]/40' : ''
                    } ${justUpdated ? 'animate-in fade-in-0 duration-deliberate ease-enter' : ''}`}
                  >
                    {training && (
                      <TrainingDayHeader
                        day={training}
                        isToday={isToday}
                        onOpen={() => setTrainingExplainOpen(true)}
                      />
                    )}
                    {preRun && <PreRunNote note={preRun} />}

                    {/* T-07.6 (UX-07 §2): a day outside the chosen shape says
                        so and offers to add it via `planDay` — `planned` is
                        reliable on every read (T-07.6). */}
                    {day.meals.length === 0 && day.planned === false && !isPast && (
                      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed bg-gray-50 p-2 text-center">
                        <p
                          data-testid={`plan-day-unplanned-${day.dayOfWeek}`}
                          className="text-[11px] leading-tight text-gray-500"
                        >
                          Not planned
                        </p>
                        <button
                          type="button"
                          data-testid={`plan-day-add-${day.dayOfWeek}`}
                          disabled={planDayMutation.isPending && planningDay === day.dayOfWeek}
                          onClick={() =>
                            planDayMutation.mutate({
                              planId: plan.planId,
                              dayOfWeek: day.dayOfWeek,
                            })
                          }
                          className="min-h-11 px-1 text-xs font-semibold text-[#944a00] hover:underline disabled:opacity-50"
                        >
                          {planDayMutation.isPending && planningDay === day.dayOfWeek
                            ? '…'
                            : 'Plan this day'}
                        </button>
                      </div>
                    )}

                    {/* Meal cards */}
                    {day.meals.map((slot, slotIndex) => {
                      const override = imageOverrides[slot.recipe.id];
                      return (
                        <MealCard
                          key={`${slot.type}-${slotIndex}`}
                          mealType={slot.type}
                          recipe={slot.recipe}
                          planId={plan.planId}
                          dayOfWeek={day.dayOfWeek}
                          slotIndex={slotIndex}
                          readOnly={isPast}
                          imageUrlOverride={override?.imageUrl}
                          imageStatusOverride={override?.status}
                          leftoverLabel={slot.leftoverOf}
                          portion={slot.portion}
                          pinned={slot.pinned}
                          onReplace={() =>
                            setReplaceTarget({
                              planId: plan.planId,
                              dayOfWeek: day.dayOfWeek,
                              mealType: slot.type,
                              slotIndex,
                              mealName: slot.recipe.name,
                              recipeId: slot.recipe.id,
                            })
                          }
                          onTogglePin={() =>
                            pinMutation.mutate({
                              planId: plan.planId,
                              dayOfWeek: day.dayOfWeek,
                              mealType: slot.type,
                              slotIndex,
                              pinned: !slot.pinned,
                            })
                          }
                        />
                      );
                    })}

                    {/* Day totals */}
                    <DayRecapBar
                      meals={day.meals}
                      calorieTarget={dayTarget}
                      proteinGapG={day.proteinGapG}
                      onOpenMiss={openMiss ? () => openMiss(day.dayOfWeek) : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My weeks (P2-8): saved weeks + past weeks live on their own page */}
      {!isPast && (
        <div className="mx-4 mb-6 sm:mx-6">
          <Link
            href="/my-weeks"
            data-testid="plan-my-weeks-link"
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-sm transition hover:border-[#944a00]/30"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Repeat className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold text-gray-900">My weeks</span>
                <span className="block text-xs text-gray-500">
                  Save this week, follow a saved one, or look back at past weeks
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          </Link>
        </div>
      )}

      <ReplaceMealSheet
        target={replaceTarget}
        onClose={() => setReplaceTarget(null)}
        onChanged={({ recipeName, previousRecipeId, target }: ReplaceMealResult) => {
          setToast({
            message: `Swapped to ${recipeName}`,
            ...(previousRecipeId && {
              action: {
                label: 'Undo',
                onClick: () =>
                  replaceMutation.mutate({
                    planId: target.planId,
                    dayOfWeek: target.dayOfWeek,
                    mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                    slotIndex: target.slotIndex,
                    recipeId: previousRecipeId,
                  }),
              },
            }),
          });
        }}
      />

      {/* T-08.9 (UX-08 §3, PAT-5): Regenerate always asks first; "Keep"
          defaults on and only shows when picks exist. */}
      <Sheet
        open={regenerateConfirmOpen}
        onClose={() => setRegenerateConfirmOpen(false)}
        title={`Regenerate ${weekOffset === 0 ? 'this week' : 'next week'}?`}
        description={`This replaces the ${plannedMealsCount} planned meal${plannedMealsCount === 1 ? '' : 's'}.`}
        size="sm"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setRegenerateConfirmOpen(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="regenerate-confirm-submit"
              onClick={() =>
                generateWithConsent({
                  weekOffset,
                  ...(leftovers && { leftovers: true as const }),
                  ...fitTrainingInput,
                  keepPinned: keepPicks,
                })
              }
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#944a00] text-sm font-semibold text-white hover:bg-[#7a3d00]"
            >
              {weekOffset === 0 ? 'Regenerate this week' : 'Regenerate next week'}
            </button>
          </div>
        }
      >
        <div className="px-5 pb-4">
          {pinnedCount > 0 && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
              Keep the {pinnedCount} meal{pinnedCount === 1 ? '' : 's'} you chose
              <input
                type="checkbox"
                data-testid="regenerate-keep-picks"
                checked={keepPicks}
                onChange={(e) => setKeepPicks(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
              />
            </label>
          )}
        </div>
      </Sheet>

      {/* T-06.8: why this week has training days, one dialog for both layouts */}
      <TrainingExplainSheet
        open={trainingExplainOpen}
        onClose={() => setTrainingExplainOpen(false)}
        days={plan?.trainingDays ?? []}
        basis={plan?.trainingBasis ?? null}
      />

      {/* T-11.3: a day off its target — portions, a snack, or leave it */}
      {plan &&
        missDay !== null &&
        (() => {
          const miss = missFor(missDay);
          if (!miss) return null;
          return (
            <PlanMissSheet
              open
              onClose={() => setMissDay(null)}
              planId={plan.planId}
              dayOfWeek={missDay}
              dayName={DAY_NAMES[missDay] ?? ''}
              kcal={miss.kcal}
              target={miss.target}
              proteinGapG={miss.day.proteinGapG}
              goal={goal}
              onAddSnack={() => handleAddSnack(missDay)}
              onApplied={(message) => setToast({ message })}
            />
          );
        })()}

      <PlanSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hasPlan={plan !== null && plan !== undefined}
        weekLabel={weekOffset === 0 ? 'this week' : 'next week'}
        isPremium={isPremium === true}
        fitTrainingDays={fitTraining}
        onFitTrainingDaysChange={setFitTraining}
        onSaved={() => {
          void utils.mealPlan.getShape.invalidate();
          // A plan already exists for this week — the settings change needs
          // its own regenerate confirm (interaction spec: settings never
          // regenerate by themselves).
          if (plan) openRegenerateConfirm();
        }}
      />

      {toast && (
        <Toast
          message={toast.message}
          {...(toast.action && { action: toast.action })}
          onClose={() => setToast(null)}
        />
      )}

      {isGenerating && <GenerateOverlay premium={isPremium !== false} />}
    </div>
  );
}
