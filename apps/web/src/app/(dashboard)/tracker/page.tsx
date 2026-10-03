'use client';

import Image from 'next/image';
import { useState } from 'react';
import { TrainingDayNote } from '@/features/dashboard/components/training-day-note';
import { RebalanceBanner } from '@/features/meal-plan/components/RebalanceBanner';
import { ChangeNoticeCard } from '@/features/nutrition/components/ChangeNoticeCard';
import { TargetExplainSheet } from '@/features/nutrition/components/TargetExplainSheet';
import { EditEntrySheet } from '@/features/tracker/components/EditEntrySheet';
import { EditRecipeEntrySheet } from '@/features/tracker/components/EditRecipeEntrySheet';
import { QuickAddSheet } from '@/features/tracker/components/QuickAddSheet';
import { ScanMealButton } from '@/features/tracker/components/ScanMealButton';
import { invalidateDayQueries } from '@/features/tracker/lib/invalidate';
import { handleRebalanceResult } from '@/features/tracker/lib/rebalance-storage';
import {
  customEntryChipLabel,
  customEntryRows,
  type CustomEntryRow,
} from '@/features/tracker/lib/tracker-utils';
import { useTrackerWrites } from '@/features/tracker/lib/use-tracker-writes';
import { useIsPremium } from '@/hooks/useIsPremium';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { addDays, format } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Flame, Info, Trash2 } from 'lucide-react';
import { ErrorState, Sheet, Toast } from '@chefer/ui';
import {
  copyDayMessage,
  formatPortion,
  groupByMeal,
  localDateStr,
  plannedRowKey,
  slotPortion,
  sumLogged,
  tickStateFromLog,
  userFacingErrorMessage,
} from '@chefer/utils';

type PortionKey = number;
const PORTION_OPTIONS: PortionKey[] = [0.5, 1, 1.5, 2];

/**
 * P1-1: a planned meal's default portion is the plan slot's (a curated day
 * sized to 1¼× logs 1¼×), within the tracker's 0.5–2 range. The picker gets
 * that portion as an extra option when it isn't one of the four.
 */
const planPortionOf = (meal: { portion?: number }): PortionKey =>
  Math.min(2, Math.max(0.5, slotPortion(meal.portion)));
const portionOptionsFor = (meal: { portion?: number }): PortionKey[] =>
  [...new Set([...PORTION_OPTIONS, planPortionOf(meal)])].sort((a, b) => a - b);

/**
 * A planned row's key: its plan slot, so two identical snacks are two rows
 * that tick separately (they used to share `recipeId:mealType`).
 */
const keyOf = plannedRowKey;

// Local calendar day, not the UTC one (F-TRK-1-1).
const toDateStr = (d: Date): string => localDateStr(d);

/** "yesterday" when `from` is the calendar day before `to`, else a short date. */
function relativeDayLabel(from: Date, to: Date): string {
  const diffDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return 'yesterday';
  return format(from, 'EEE d MMM');
}

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

export default function TrackerPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = toDateStr(selectedDate);
  const todayStr = toDateStr(new Date());
  const isToday = todayStr === dateStr;
  const isFuture = selectedDate > new Date() && !isToday;
  // §2.11, T-11.2: fetched lazily (enabled only once the sheet opens) to
  // keep it off the tracker's critical path.
  const [explainOpen, setExplainOpen] = useState(false);
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { enabled: explainOpen });

  const utils = trpc.useUtils();
  const { data, isLoading, isError, isRefetching, refetch } = trpc.tracker.getDay.useQuery(
    { date: dateStr },
    { enabled: !isFuture, staleTime: 30_000 },
  );

  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CustomEntryRow | null>(null);
  const [editingRecipeEntryId, setEditingRecipeEntryId] = useState<string | null>(null);

  const showToast = (message: string, action?: { label: string; onClick: () => void }) =>
    setToast({ message, ...(action && { action }) });

  // UX-FOOD-01: ticks and totals are DERIVED from the cached day on every
  // render — there is no once-a-day copy in component state, so Undo, a log
  // made on Today or a write that failed can never leave the page out of step
  // with the server. Taps edit that cached day optimistically (see
  // useTrackerWrites: rolled back on error, re-fetched on settle).
  const ticks = tickStateFromLog(data?.plannedMeals ?? [], data?.log?.loggedMeals ?? []);

  const isPremium = useIsPremium();

  // ─── One-save model (bug B-23, T-19.4) — every tick/portion change saves
  // immediately through logRecipe/unlogRecipe; there is no Save Day. ────────
  const {
    logRecipe: logRecipeMutation,
    unlogRecipe: unlogRecipeMutation,
    deleteCustom: deleteCustomMutation,
    deleteEntries: deleteEntriesMutation,
    restoreCustom: restoreCustomMutation,
    updateRecipeEntry: updateRecipeEntryMutation,
  } = useTrackerWrites(dateStr, showToast);
  const copyDayMutation = trpc.tracker.copyDay.useMutation({ meta: { silent: true } });

  const planned = (data?.plannedMeals ?? []).map((m, i) => ({ ...m, key: keyOf(m, i) }));
  type PlannedRow = (typeof planned)[number];

  const logSlot = (meal: PlannedRow, portionMultiplier: PortionKey, onSuccess?: () => void) => {
    logRecipeMutation.mutate(
      {
        date: dateStr,
        recipeId: meal.recipeId,
        mealType: meal.mealType,
        portionMultiplier,
        ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
      },
      onSuccess ? { onSuccess } : {},
    );
  };
  const unlogSlot = (meal: PlannedRow, onSuccess?: () => void) => {
    unlogRecipeMutation.mutate(
      {
        date: dateStr,
        recipeId: meal.recipeId,
        mealType: meal.mealType,
        ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
      },
      onSuccess ? { onSuccess } : {},
    );
  };

  // The toast confirms only once the server has said yes (UX-FOOD-06): a
  // failed write shows the reason instead (useTrackerWrites) and the tick
  // goes back.
  const toggleMeal = (meal: PlannedRow) => {
    const wasChecked = ticks[meal.key]?.checked ?? false;
    const portion = ticks[meal.key]?.portion ?? planPortionOf(meal);
    if (!wasChecked) {
      logSlot(meal, portion, () =>
        showToast(`Logged ${meal.mealType}`, {
          label: 'Undo',
          onClick: () => unlogSlot(meal),
        }),
      );
    } else {
      unlogSlot(meal, () =>
        showToast(`Removed ${meal.mealType}`, {
          label: 'Undo',
          onClick: () => logSlot(meal, portion),
        }),
      );
    }
  };

  const setPortion = (meal: PlannedRow, portion: PortionKey) => logSlot(meal, portion);

  // Custom and off-plan entries are server-owned: each write is its own
  // mutation (F-PM-1, F-TRK-1-2) — nothing here re-sends them.
  const offPlanLogged = data?.offPlanLogged ?? [];
  // Rendered rows (F4): custom entries with their delete-target index into
  // the FULL loggedMeals array preserved.
  const customRows = customEntryRows(data?.log?.loggedMeals ?? []);
  // UX-FOOD-25: off-plan recipes and custom entries are ONE "Also eaten" list,
  // grouped under the meal they belong to (they were two stacked sections
  // with the same header).
  const alsoEaten = groupByMeal([
    ...offPlanLogged.map((m) => ({ kind: 'recipe' as const, mealType: m.mealType, m })),
    ...customRows.map((row) => ({ kind: 'custom' as const, mealType: row.mealType, row })),
  ]);

  const deleteCustomEntry = (row: CustomEntryRow) => {
    if (deleteCustomMutation.isPending) return;
    const entryId = row.entryId;
    deleteCustomMutation.mutate(
      // UX-FOOD-17: by stable id when the row has one (the index is only the
      // fallback for an entry that has none yet).
      entryId
        ? { date: dateStr, entryId, entryIndex: row.entryIndex }
        : { date: dateStr, entryIndex: row.entryIndex },
      {
        onSuccess: () => {
          showToast(
            `Deleted ${row.name}`,
            entryId
              ? {
                  label: 'Undo',
                  onClick: () =>
                    restoreCustomMutation.mutate({
                      date: dateStr,
                      entry: {
                        entryId,
                        custom: { name: row.name, estimatedBy: row.estimatedBy },
                        mealType: row.mealType,
                        portionMultiplier: 1,
                        kcal: row.kcal,
                        protein: row.protein,
                        carbs: row.carbs,
                        fat: row.fat,
                        ...(row.unknownMacros && { unknownMacros: [...row.unknownMacros] }),
                      },
                    }),
                }
              : undefined,
          );
        },
      },
    );
  };

  // Off-plan recipe rows (UX-FOOD-03): editable and removable like custom
  // entries — they used to be read-only, so a mis-log or a stale one could
  // never be fixed.
  const editingRecipeEntry = offPlanLogged.find((m) => m.entryId === editingRecipeEntryId) ?? null;
  const deleteOffPlanEntry = (row: (typeof offPlanLogged)[number]) => {
    const entryId = row.entryId;
    if (!entryId) return;
    deleteEntriesMutation.mutate(
      { date: dateStr, entryIds: [entryId] },
      {
        onSuccess: () => {
          setEditingRecipeEntryId(null);
          showToast(`Deleted ${row.recipeName}`, {
            label: 'Undo',
            // The entry is re-logged exactly as it was (recipe, meal, portion).
            onClick: () =>
              logRecipeMutation.mutate({
                date: dateStr,
                recipeId: row.recipeId,
                mealType: row.mealType,
                portionMultiplier: row.portionMultiplier ?? 1,
              }),
          });
        },
      },
    );
  };

  const copyFromDate = addDays(selectedDate, -1);
  const copyFromDateStr = toDateStr(copyFromDate);
  const copyLabel = relativeDayLabel(copyFromDate, selectedDate);

  const confirmCopyDay = () => {
    copyDayMutation.mutate(
      { fromDate: copyFromDateStr, toDate: dateStr },
      {
        onSuccess: (result) => {
          handleRebalanceResult(result.rebalance);
          setCopyDayOpen(false);
          invalidateDayQueries(utils); // both the source and target dates
          showToast(
            copyDayMessage(result.copiedEntryIds.length, copyLabel),
            result.copiedEntryIds.length > 0
              ? {
                  label: 'Undo',
                  onClick: () =>
                    deleteEntriesMutation.mutate({
                      date: dateStr,
                      entryIds: result.copiedEntryIds,
                    }),
                }
              : undefined,
          );
        },
        onError: (error) => {
          setCopyDayOpen(false);
          showToast(`Couldn't copy the day. ${userFacingErrorMessage(error)}`);
        },
      },
    );
  };

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
  };

  // The day's totals are whatever the log holds — planned ticks, custom
  // entries and off-plan recipes alike (the server's own definition).
  const {
    kcal: loggedKcal,
    protein: loggedProtein,
    carbs: loggedCarbs,
    fat: loggedFat,
  } = sumLogged(data?.log?.loggedMeals ?? []);
  // All four targets come from the API's resolveDailyTargets — the same
  // source the dashboard uses, so the two surfaces can never disagree
  // (prod-followups #4). A premium lifter's training day swaps in the bumped
  // targets, exactly like Today (audit P2-4). Fallbacks only cover the
  // pre-data render.
  const dayTargets = data?.adjustedTargets ?? data?.targets;
  const target = dayTargets?.dailyCalorieTarget ?? 2000;
  const proteinTarget = dayTargets?.proteinG ?? 125;
  const carbsTarget = dayTargets?.carbsG ?? 225;
  const fatTarget = dayTargets?.fatG ?? 67;
  const pct = (v: number, t: number) => Math.min(Math.round((v / (t || 1)) * 100), 100);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            DAILY LOG
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Tracker</h1>
        </div>
        <button
          type="button"
          data-testid="tracker-copy-day"
          aria-label={`Copy ${copyLabel} to ${isToday ? 'today' : 'this day'}`}
          onClick={() => setCopyDayOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
        >
          <Copy className="h-5 w-5" />
        </button>
      </div>

      {/* Date selector */}
      <div className="mb-6 flex items-center justify-between gap-2 rounded-2xl border bg-white px-2 py-2 shadow-sm sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={() => changeDate(-1)}
          aria-label="Previous day"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-neutral-100"
        >
          <ChevronLeft className="h-5 w-5 text-neutral-500" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-neutral-800">
            {isToday ? 'Today' : format(selectedDate, 'EEEE')}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {format(selectedDate, 'dd MMMM yyyy')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => changeDate(1)}
          disabled={isToday}
          aria-label="Next day"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-neutral-100 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5 text-neutral-500" />
        </button>
      </div>

      {/* Feedback where the log happened (audit F-TRK-3-2): a premium log can
          adjust future meals — say so here, with Undo. */}
      <RebalanceBanner onUndone={() => void utils.mealPlan.invalidate()} />

      {isFuture && (
        <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-neutral-500">
          Can&apos;t log future meals.
        </div>
      )}

      {!isFuture && isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      {/* A failed load is not an empty day (audit F-X-3-1). */}
      {!isFuture && isError && !data && (
        <ErrorState
          title="Couldn't load this day"
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      )}

      {!isFuture && !isLoading && data && (
        <>
          {/* Snap-to-Log (F4): photo scan (premium; demo for free) + the
              search-first Log sheet — the honesty tools for off-plan food. */}
          <div className="mb-6 flex flex-wrap gap-2">
            <ScanMealButton
              date={dateStr}
              isPremium={isPremium}
              onLogged={() => void refetch()}
              onLoggedEntry={({ entryId, name }) =>
                showToast(`Logged ${name}`, {
                  label: 'Undo',
                  onClick: () => deleteCustomMutation.mutate({ date: dateStr, entryId }),
                })
              }
            />
            <QuickAddSheet
              date={dateStr}
              onLogged={() => void refetch()}
              plannedMeals={data.plannedMeals.map((m, i) => ({
                recipeId: m.recipeId,
                recipeName: m.recipeName,
                mealType: m.mealType,
                imageUrl: m.imageUrl,
                kcal: m.kcal,
                protein: m.protein,
                carbs: m.carbs,
                fat: m.fat,
                ...(m.portion !== undefined && { portion: m.portion }),
                slotIndex: m.slotIndex ?? i,
              }))}
            />
          </div>

          {/* Target change notice (§2.11, T-11.1/T-11.5) — never a silent change */}
          <ChangeNoticeCard />

          {/* Macro summary */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                {isToday ? "Today's Progress" : 'Day Progress'}
              </p>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm font-bold text-neutral-700">
                  <Flame className="h-4 w-4 text-[#944a00]" />
                  {loggedKcal.toLocaleString()} / {target.toLocaleString()} kcal
                </span>
                {/* UX-11 AC3: tapping the day totals opens "Why this number". */}
                <button
                  type="button"
                  aria-label="Why this target"
                  data-testid="tracker-why-target"
                  onClick={() => setExplainOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                >
                  <Info className="h-4 w-4" />
                </button>
              </div>
            </div>
            {data.trainingDay && <TrainingDayNote t={data.trainingDay} isToday={isToday} />}
            {[
              { label: 'Calories', v: loggedKcal, t: target, unit: 'kcal', colour: 'bg-[#944a00]' },
              {
                label: 'Protein',
                v: loggedProtein,
                t: proteinTarget,
                unit: 'g',
                colour: 'bg-blue-500',
              },
              {
                label: 'Carbs',
                v: loggedCarbs,
                t: carbsTarget,
                unit: 'g',
                colour: 'bg-emerald-500',
              },
              { label: 'Fat', v: loggedFat, t: fatTarget, unit: 'g', colour: 'bg-amber-400' },
            ].map(({ label, v, t, unit, colour }) => (
              <div key={label} className="mb-2">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-neutral-600">{label}</span>
                  <span className="text-neutral-500">
                    {Math.round(v)}
                    {unit} / {t}
                    {unit}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${colour} transition-all`}
                    style={{ width: `${pct(v, t)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Meal list */}
          {data.plannedMeals.length === 0 ? (
            <div
              data-testid="tracker-empty-plan"
              className="rounded-2xl border border-dashed py-10 text-center text-sm text-neutral-500"
            >
              {!data.hasActivePlan ? (
                // T-19.6: a Track-only user may never generate a plan — this
                // reads as an invitation to log, not a missing-plan error.
                <p>No plan today — log from Recent or search below.</p>
              ) : (
                <>
                  No meals planned for this day.{' '}
                  <a
                    href="/meal-plan"
                    className="touch-target relative text-[#944a00] hover:underline"
                  >
                    Go to Meal Planner →
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="mb-6 space-y-3">
              {planned.map((meal) => {
                const k = meal.key;
                const isChecked = ticks[k]?.checked ?? false;
                const portion = ticks[k]?.portion ?? planPortionOf(meal);
                const scaledKcal = Math.round(meal.kcal * portion);

                return (
                  <div
                    key={k}
                    className={`flex gap-3 rounded-2xl border p-3 transition-all ${isChecked ? 'border-[#944a00]/30 bg-[#fff8f0]' : 'border-neutral-200 bg-white'}`}
                  >
                    {/* Image */}
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        {...getRecipeImageProps(meal.imageUrl)}
                        alt={meal.recipeName}
                        fill
                        sizes="56px"
                        className={`object-cover transition-opacity ${isChecked ? 'opacity-100' : 'opacity-60'}`}
                      />
                    </div>

                    {/* Details */}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {meal.mealType}
                          </span>
                          <p className="mt-0.5 text-sm font-medium text-neutral-800">
                            {meal.recipeName}
                          </p>
                        </div>
                        {/* 24px was the smallest target on the page's primary
                            action. Visual size holds; the hit area is 44px. */}
                        <button
                          type="button"
                          onClick={() => toggleMeal(meal)}
                          aria-pressed={isChecked}
                          className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center p-2.5"
                          aria-label={`${isChecked ? 'Uncheck' : 'Check'} ${meal.recipeName}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${isChecked ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-300 text-transparent'}`}
                          >
                            {isChecked && <span className="text-xs font-bold">✓</span>}
                          </span>
                        </button>
                      </div>

                      {/* Portion + kcal — a four-up segmented control that fills
                          the row, rather than four ~34x20px pills. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          role="group"
                          aria-label={`Portion size for ${meal.recipeName}`}
                          className="flex flex-1 gap-1 sm:flex-none"
                        >
                          {portionOptionsFor(meal).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPortion(meal, p)}
                              aria-pressed={portion === p && isChecked}
                              className={`min-h-11 flex-1 rounded-lg px-2 text-xs font-medium transition-all sm:flex-none sm:px-3 ${portion === p && isChecked ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                            >
                              {formatPortion(p)}
                            </button>
                          ))}
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">
                          {scaledKcal} kcal
                          {planPortionOf(meal) !== 1 &&
                            ` · plan ${formatPortion(planPortionOf(meal))}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Also eaten — off-plan recipes (F-PM-1: logged, then left today's
              plan) and custom entries (F4: photo scans + quick adds), one
              list grouped by meal. Tap to edit, bin to delete with Undo
              (UX-FOOD-03, bug B-34, T-19.2, UX-FOOD-25). */}
          {alsoEaten.length > 0 && (
            <div className="mb-6" data-testid="tracker-also-eaten">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Also eaten
              </h2>
              <div className="space-y-4">
                {alsoEaten.map((group) => (
                  <div key={group.mealType} data-testid={`tracker-also-eaten-${group.mealType}`}>
                    <span
                      className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[group.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {group.mealType}
                    </span>
                    <div className="space-y-3">
                      {group.rows.map((item) =>
                        item.kind === 'recipe' ? (
                          <div
                            key={item.m.entryId ?? `${item.m.recipeId}:${item.m.mealType}`}
                            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3"
                          >
                            <button
                              type="button"
                              data-testid={`tracker-off-plan-${item.m.entryId ?? item.m.recipeId}`}
                              aria-label={`Edit ${item.m.recipeName}`}
                              disabled={!item.m.entryId}
                              onClick={() => setEditingRecipeEntryId(item.m.entryId ?? null)}
                              className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl text-left hover:bg-neutral-50 disabled:cursor-default disabled:hover:bg-transparent"
                            >
                              <span className="min-w-0 truncate text-sm font-medium text-neutral-800">
                                {item.m.recipeName}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {Math.round(item.m.kcal)} kcal · {Math.round(item.m.protein)}g P ·{' '}
                                {Math.round(item.m.carbs)}g C · {Math.round(item.m.fat)}g F
                                {(item.m.portionMultiplier ?? 1) !== 1 &&
                                  ` · ${formatPortion(item.m.portionMultiplier ?? 1)}`}
                              </span>
                            </button>
                            {item.m.entryId && (
                              <button
                                type="button"
                                aria-label={`Delete ${item.m.recipeName}`}
                                disabled={deleteEntriesMutation.isPending}
                                onClick={() => deleteOffPlanEntry(item.m)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            key={item.row.entryIndex}
                            data-testid={`tracker-custom-${item.row.entryIndex}`}
                            onClick={() => setEditingEntry(item.row)}
                            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left hover:bg-neutral-50"
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase text-neutral-600">
                                  {customEntryChipLabel(item.row.estimatedBy)}
                                </span>
                              </div>
                              <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
                                {item.row.name}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {item.row.kcal} kcal
                                {item.row.protein > 0 || item.row.carbs > 0 || item.row.fat > 0
                                  ? ` · ${Math.round(item.row.protein)}g P · ${Math.round(item.row.carbs)}g C · ${Math.round(item.row.fat)}g F`
                                  : ''}
                              </p>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Delete ${item.row.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCustomEntry(item.row);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  deleteCustomEntry(item.row);
                                }
                              }}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <TargetExplainSheet
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        view={targetsView}
      />

      <EditEntrySheet
        open={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        date={dateStr}
        entry={editingEntry}
        onSaved={() => void refetch()}
        onDeleted={() => setEditingEntry(null)}
        showToast={showToast}
      />

      <EditRecipeEntrySheet
        open={editingRecipeEntry !== null}
        onClose={() => setEditingRecipeEntryId(null)}
        entry={editingRecipeEntry}
        onSave={(edit) => {
          if (!editingRecipeEntry?.entryId) return;
          updateRecipeEntryMutation.mutate({
            date: dateStr,
            entryId: editingRecipeEntry.entryId,
            ...edit,
          });
          setEditingRecipeEntryId(null);
        }}
        onDelete={() => editingRecipeEntry && deleteOffPlanEntry(editingRecipeEntry)}
      />

      <Sheet
        open={copyDayOpen}
        onClose={() => setCopyDayOpen(false)}
        title="Copy day"
        description={`Copy everything logged ${copyLabel} to ${isToday ? 'today' : 'this day'}? You can undo it right after.`}
        size="sm"
        footer={
          <div className="flex w-full gap-2 px-5 pb-2">
            <button
              type="button"
              onClick={() => setCopyDayOpen(false)}
              className="min-h-11 flex-1 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="tracker-copy-day-confirm"
              onClick={confirmCopyDay}
              disabled={copyDayMutation.isPending}
              className="min-h-11 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
            >
              {copyDayMutation.isPending ? 'Copying…' : `Copy ${copyLabel}`}
            </button>
          </div>
        }
      >
        <div />
      </Sheet>

      {toast && (
        <Toast
          message={toast.message}
          onClose={() => setToast(null)}
          // Bug B-34/AC2: an Undo toast (delete, remove-meal, copy-day) needs
          // longer than the plain 3s default — deleting also invalidates the
          // day/summary/recents queries, and that refetch's render can eat
          // into the window before the user gets a chance to tap Undo.
          // 8000ms matches mobile's WITH_ACTION_DURATION_MS
          // (packages/ui-mobile/src/components/snackbar.tsx).
          duration={toast.action ? 8000 : 3000}
          {...(toast.action && { action: toast.action })}
        />
      )}
    </div>
  );
}
