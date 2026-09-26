'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { TrainingDayNote } from '@/features/dashboard/components/training-day-note';
import { RebalanceBanner } from '@/features/meal-plan/components/RebalanceBanner';
import { QuickAddSheet } from '@/features/tracker/components/QuickAddSheet';
import { ScanMealButton } from '@/features/tracker/components/ScanMealButton';
import { handleRebalanceResult } from '@/features/tracker/lib/rebalance-storage';
import {
  customEntryChipLabel,
  customEntryRows,
  customEntryTotals,
} from '@/features/tracker/lib/tracker-utils';
import { useIsPremium } from '@/hooks/useIsPremium';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { addDays, format } from 'date-fns';
import { ChevronLeft, ChevronRight, Flame, Save, Trash2 } from 'lucide-react';
import { ErrorState } from '@chefer/ui';
import { formatPortion, localDateStr, matchLoggedToSlots, slotPortion } from '@chefer/utils';

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
const keyOf = (meal: { slotIndex?: number }, i: number): string => String(meal.slotIndex ?? i);

// Local calendar day, not the UTC one (F-TRK-1-1).
const toDateStr = (d: Date): string => localDateStr(d);

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

  const utils = trpc.useUtils();
  const { data, isLoading, isError, isRefetching, refetch } = trpc.tracker.getDay.useQuery(
    { date: dateStr },
    { enabled: !isFuture, staleTime: 30_000 },
  );

  // checkedMeals: map plan slot (keyOf) → { checked, portion }
  const [checkedMeals, setCheckedMeals] = useState<
    Record<string, { checked: boolean; portion: PortionKey }>
  >({});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [initialised, setInitialised] = useState<string | null>(null); // tracks which dateStr we initialised for

  // When data loads, pre-populate from existing log (only once per dateStr).
  // Entries without a recipeId are custom (Snap-to-Log quick-adds, F4) — they
  // don't map to a planned-meal row, so they're skipped here and preserved
  // verbatim on save instead.
  // Each logged entry ticks ONE slot (matchLoggedToSlots): its own slot when
  // it carries a slotIndex, else the first free slot of its recipe and type.
  useEffect(() => {
    if (!data || initialised === dateStr) return;
    if (data.log) {
      const init: Record<string, { checked: boolean; portion: PortionKey }> = {};
      const matched = matchLoggedToSlots(
        data.plannedMeals.map((m, i) => ({
          type: m.mealType,
          recipeId: m.recipeId,
          slotIndex: m.slotIndex ?? i,
        })),
        data.log.loggedMeals,
      );
      data.plannedMeals.forEach((m, i) => {
        const entry = matched[i];
        if (entry) init[keyOf(m, i)] = { checked: true, portion: entry.portionMultiplier };
      });
      setCheckedMeals(init);
    } else {
      setCheckedMeals({});
    }
    setInitialised(dateStr);
  }, [data, dateStr, initialised]);

  const isPremium = useIsPremium();

  const upsertMutation = trpc.tracker.upsertDay.useMutation({
    onSuccess: (result) => {
      // F4: a save can trigger a week rebalance — hand the swaps off to the
      // meal-plan banner (with undo) and fire the analytics event.
      handleRebalanceResult(result.rebalance);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      void refetch();
    },
  });

  const deleteCustomMutation = trpc.tracker.deleteCustomMeal.useMutation({
    onSuccess: () => void refetch(),
  });

  const toggleMeal = (k: string, planPortion: PortionKey) => {
    setCheckedMeals((prev) => ({
      ...prev,
      [k]: { checked: !(prev[k]?.checked ?? false), portion: prev[k]?.portion ?? planPortion },
    }));
    setSavedSuccess(false);
  };

  const setPortion = (k: string, portion: PortionKey) => {
    setCheckedMeals((prev) => ({ ...prev, [k]: { ...prev[k], checked: true, portion } }));
    setSavedSuccess(false);
  };

  // Custom and off-plan entries are server-owned: upsertDay merges, so the
  // save sends only the planned meals this page manages (F-PM-1, F-TRK-1-2).
  const offPlanLogged = data?.offPlanLogged ?? [];
  // A day that already has planned meals logged can be saved with nothing
  // ticked — that un-logs them (F-TRK-1-3).
  const plannedIds = new Set(data?.plannedMeals.map((m) => m.recipeId) ?? []);
  const hadPlannedLogged = (data?.log?.loggedMeals ?? []).some(
    (m) => m.recipeId !== undefined && plannedIds.has(m.recipeId),
  );
  // Rendered rows (F4): custom entries with their delete-target index into
  // the FULL loggedMeals array preserved.
  const customRows = customEntryRows(data?.log?.loggedMeals ?? []);

  const handleSave = () => {
    if (!data) return;
    const plannedLogged = data.plannedMeals
      .map((m, i) => ({ m, k: keyOf(m, i) }))
      .filter(({ k }) => checkedMeals[k]?.checked)
      .map(({ m, k }) => {
        const portion = checkedMeals[k]?.portion ?? planPortionOf(m);
        return {
          recipeId: m.recipeId,
          mealType: m.mealType,
          ...(m.slotIndex !== undefined && { slotIndex: m.slotIndex }),
          portionMultiplier: portion,
          kcal: Math.round(m.kcal * portion),
          protein: Math.round(m.protein * portion * 10) / 10,
          carbs: Math.round(m.carbs * portion * 10) / 10,
          fat: Math.round(m.fat * portion * 10) / 10,
        };
      });
    if (plannedLogged.length === 0 && !hadPlannedLogged) return;
    upsertMutation.mutate({ date: dateStr, loggedMeals: plannedLogged });
  };

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
    setCheckedMeals({});
    setSavedSuccess(false);
    setInitialised(null);
  };

  // Compute logged totals from current UI state, plus already-saved custom
  // entries (their macros are stored pre-scaled, so no portion multiply).
  const loggedMeals = (data?.plannedMeals ?? []).flatMap((m, i) => {
    const state = checkedMeals[keyOf(m, i)];
    return state?.checked ? [{ ...m, logPortion: state.portion }] : [];
  });
  const {
    kcal: customKcal,
    protein: customProtein,
    carbs: customCarbs,
    fat: customFat,
  } = customEntryTotals(data?.log?.loggedMeals ?? []);
  const offPlan = offPlanLogged.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const loggedKcal =
    loggedMeals.reduce((s, m) => s + Math.round(m.kcal * m.logPortion), 0) +
    customKcal +
    offPlan.kcal;
  const loggedProtein =
    loggedMeals.reduce((s, m) => s + m.protein * m.logPortion, 0) + customProtein + offPlan.protein;
  const loggedCarbs =
    loggedMeals.reduce((s, m) => s + m.carbs * m.logPortion, 0) + customCarbs + offPlan.carbs;
  const loggedFat =
    loggedMeals.reduce((s, m) => s + m.fat * m.logPortion, 0) + customFat + offPlan.fat;
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
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          DAILY LOG
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Tracker</h1>
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
          {/* Snap-to-Log (F4): photo scan (premium; demo for free) + free
              quick-add — the honesty tools for off-plan food. */}
          <div className="mb-6 flex flex-wrap gap-2">
            <ScanMealButton date={dateStr} isPremium={isPremium} onLogged={() => void refetch()} />
            <QuickAddSheet date={dateStr} onLogged={() => void refetch()} />
          </div>

          {/* Macro summary */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                {isToday ? "Today's Progress" : 'Day Progress'}
              </p>
              <span className="flex items-center gap-1 text-sm font-bold text-neutral-700">
                <Flame className="h-4 w-4 text-[#944a00]" />
                {loggedKcal.toLocaleString()} / {target.toLocaleString()} kcal
              </span>
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
            <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-neutral-500">
              No meals planned for this day.{' '}
              <a href="/meal-plan" className="touch-target relative text-[#944a00] hover:underline">
                Go to Meal Planner →
              </a>
            </div>
          ) : (
            <div className="mb-6 space-y-3">
              {data.plannedMeals.map((meal, i) => {
                const k = keyOf(meal, i);
                const isChecked = checkedMeals[k]?.checked ?? false;
                const portion = checkedMeals[k]?.portion ?? planPortionOf(meal);
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
                          onClick={() => toggleMeal(k, planPortionOf(meal))}
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
                              onClick={() => setPortion(k, p)}
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

          {/* Off-plan meals (F-PM-1): logged recipes that have since left
              today's plan (regenerate or swap). Kept and counted. */}
          {offPlanLogged.length > 0 && (
            <div className="mb-6" data-testid="tracker-off-plan">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Also logged today
              </p>
              <div className="space-y-3">
                {offPlanLogged.map((m) => (
                  <div
                    key={`${m.recipeId}:${m.mealType}`}
                    className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-3"
                  >
                    <span
                      className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[m.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {m.mealType}
                    </span>
                    <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
                      {m.recipeName}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {Math.round(m.kcal)} kcal · {Math.round(m.protein)}g P · {Math.round(m.carbs)}
                      g C · {Math.round(m.fat)}g F
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom entries (F4): photo scans + quick-adds. Saved server-side
              the moment they're logged — no relation to the Save button. */}
          {customRows.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Also logged
              </p>
              <div className="space-y-3">
                {customRows.map((row) => (
                  <div
                    key={row.entryIndex}
                    className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[row.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {row.mealType}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase text-neutral-600">
                          {customEntryChipLabel(row.estimatedBy)}
                        </span>
                      </div>
                      <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
                        {row.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {row.kcal} kcal
                        {row.protein > 0 || row.carbs > 0 || row.fat > 0
                          ? ` · ${Math.round(row.protein)}g P · ${Math.round(row.carbs)}g C · ${Math.round(row.fat)}g F`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        deleteCustomMutation.mutate({ date: dateStr, entryIndex: row.entryIndex })
                      }
                      disabled={deleteCustomMutation.isPending}
                      aria-label={`Delete ${row.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save button — sticky just above the mobile tab bar so it stays
              reachable without scrolling past every meal. */}
          {data.plannedMeals.length > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={
                (loggedMeals.length === 0 && !hadPlannedLogged) ||
                upsertMutation.isPending ||
                savedSuccess
              }
              className="sticky bottom-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#944a00] py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7a3d00] disabled:opacity-50 lg:static lg:shadow-none"
            >
              {upsertMutation.isPending ? (
                'Saving…'
              ) : savedSuccess ? (
                '✓ Saved!'
              ) : (
                <>
                  <Save className="h-4 w-4" />{' '}
                  {loggedMeals.length === 0
                    ? 'Clear logged meals'
                    : `Log ${loggedMeals.length} meal${loggedMeals.length !== 1 ? 's' : ''}`}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
