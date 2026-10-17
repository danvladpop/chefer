import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSnackbar } from '@chefer/ui-mobile';
import {
  copyDayMessage,
  customEntryRows,
  formatDate,
  groupByMeal,
  localDateStr,
  plannedRowKey,
  slotPortion,
  slotStates,
  sumLogged,
  tickStateFromLog,
  weeklyAverage,
  type CustomEntryRow,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { invalidateDayQueries } from './invalidate';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from './rebalance-offer-store';
import { useSlotFlow } from './slot-flow';
import { useTrackerWrites } from './use-tracker-writes';

// The tracker's state and writes, shared by the legacy Tracker screen
// (app/tracker.tsx) and the 10 Oct redesign's "Your day" (new shell). Moved
// out of the screen unchanged: the derived ticks and totals (UX-FOOD-01), the
// one-save model (B-23), copy day, delete with Undo, the WP-06 slot flow and
// the deep-link params (`snap=1`, `copy=1`).

export type PortionKey = number;

/**
 * A planned row's key: its plan slot, so two identical snacks are two rows
 * that tick separately (they used to share `recipeId:mealType`).
 */
const keyOf = plannedRowKey;

const PORTION_OPTIONS: PortionKey[] = [0.5, 1, 1.5, 2];

/**
 * P1-1: a planned meal's default portion is its plan slot's (a curated day
 * sized to 1¼× logs 1¼×), within the tracker's 0.5–2 range — same rule as
 * web. The picker gets that portion as an extra option when it's not one of
 * the four.
 */
export const planPortionOf = (meal: { portion?: number }): PortionKey =>
  Math.min(2, Math.max(0.5, slotPortion(meal.portion)));
export const portionOptionsFor = (meal: { portion?: number }): PortionKey[] =>
  [...new Set([...PORTION_OPTIONS, planPortionOf(meal)])].sort((a, b) => a - b);

// Local calendar day, not the UTC one (F-TRK-1-1).
const toDateStr = (d: Date): string => localDateStr(d);

function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

/** "yesterday" when `from` is the calendar day before `to`, else a short date. */
function relativeDayLabel(from: Date, to: Date): string {
  const diffDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return 'yesterday';
  return formatDate(from, 'weekday-short');
}

export function useTrackerDay({
  weeklyAverage: weeklyAverageEnabled = true,
}: { weeklyAverage?: boolean } = {}) {
  // UX-ACC-13: `?snap=1` (the post-upgrade "Snap your next meal" CTA) opens the
  // photo picker as soon as the Snap card is there.
  // Revamp Add sheet: `?copy=1` ("Copy yesterday") opens the copy-day confirm.
  const { snap, copy } = useLocalSearchParams<{ snap?: string; copy?: string }>();
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = toDateStr(selectedDate);
  const todayStr = toDateStr(new Date());
  const isToday = todayStr === dateStr;
  const isFuture = selectedDate > new Date() && !isToday;

  const { data, isLoading, isError, refetch } = trpc.tracker.getDay.useQuery(
    { date: dateStr },
    { enabled: !isFuture, staleTime: 30_000 },
  );
  // Same targets as Today: a premium lifter's training day swaps in the
  // bumped targets (audit P2-4); everyone else keeps the base.
  const dayTargets = data?.adjustedTargets ?? data?.targets;
  // WP-08: the day's payload decides protein-only (no kcal in rows or totals).
  const { proteinOnly } = useNumbersMode(data?.numbersMode);

  // WP-06: "Ate something else" / "Skipped it" on every planned row.
  const slotFlow = useSlotFlow(dateStr);
  // The week's average is the number this screen praises (Food 2); one day over
  // or under is just reported.
  // 10 Oct redesign: "Your day" (new shell) drops the average line, so it
  // skips the query; the legacy tracker keeps it.
  const { data: week } = trpc.tracker.weeklySummary.useQuery(
    { localDate: todayStr },
    { staleTime: 60_000, enabled: weeklyAverageEnabled },
  );
  const average = week ? weeklyAverage(week.days, todayStr) : null;

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [copyDayOpen, setCopyDayOpen] = useState(copy === '1');
  useEffect(() => {
    if (copy !== '1') return;
    setCopyDayOpen(true);
    router.setParams({ copy: undefined });
  }, [copy]);
  const [editingEntry, setEditingEntry] = useState<CustomEntryRow | null>(null);
  const [editingRecipeEntryId, setEditingRecipeEntryId] = useState<string | null>(null);

  // §2.11, T-11.2: the same resolved view targets.get exposes, for "Why this
  // number" (AC3, tapping the totals card). A no-op fetch when the sheet
  // never opens — enabled only once tapped keeps this off the tracker's
  // critical path.
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { enabled: explainOpen });

  // UX-FOOD-01: ticks and totals are DERIVED from the cached day on every
  // render — there is no once-a-day copy in component state, so Undo, a log
  // made on Today or a write that failed can never leave the screen out of
  // step with the server. Taps edit that cached day optimistically (see
  // useTrackerWrites: rolled back on error, re-fetched on settle).
  const ticks = tickStateFromLog(data?.plannedMeals ?? [], data?.log?.loggedMeals ?? []);

  // ─── One-save model (bug B-23, T-19.4) — every tick/portion change saves
  // immediately through logRecipe/unlogRecipe; there is no Save Day. ────────
  const {
    logRecipe: logRecipeMutation,
    unlogRecipe: unlogRecipeMutation,
    deleteCustom: deleteCustomMutation,
    deleteEntries: deleteEntriesMutation,
    restoreCustom: restoreCustomMutation,
    updateRecipeEntry: updateRecipeEntryMutation,
  } = useTrackerWrites(dateStr);
  const copyDayMutation = trpc.tracker.copyDay.useMutation({ meta: { silent: true } });

  const planned = (data?.plannedMeals ?? []).map((m, i) => ({ ...m, key: keyOf(m, i) }));
  type PlannedRow = (typeof planned)[number];

  // WP-06: what became of each planned slot — eaten as planned, replaced by
  // something else ("You had: …"), skipped, or still to eat. One helper for
  // every surface; `states` lines up with `planned`.
  const loggedMeals = data?.log?.loggedMeals ?? [];
  const states = slotStates(
    planned.map((m, i) => ({
      type: m.mealType,
      recipeId: m.recipeId,
      slotIndex: m.slotIndex ?? i,
    })),
    loggedMeals,
    data?.skippedSlots ?? [],
  );
  const replacedEntries = states.flatMap((st) => (st.status === 'replaced' ? [st.entry] : []));
  const replacedIndexes = new Set(replacedEntries.map((e) => loggedMeals.indexOf(e)));
  const logSlot = (meal: PlannedRow, portionMultiplier: PortionKey, onSuccess?: () => void) => {
    logRecipeMutation.mutate(
      {
        date: dateStr,
        ...REBALANCE_PREVIEW,
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

  // The snackbar confirms only once the server has said yes (UX-FOOD-06): a
  // failed write shows the reason instead (useTrackerWrites) and the tick
  // goes back.
  const toggleMeal = (meal: PlannedRow) => {
    const wasChecked = ticks[meal.key]?.checked ?? false;
    const portion = ticks[meal.key]?.portion ?? planPortionOf(meal);
    if (!wasChecked) {
      logSlot(meal, portion, () =>
        snackbar.show({
          message: `Logged ${meal.mealType}`,
          actionLabel: 'Undo',
          onAction: () => unlogSlot(meal),
          tone: 'success',
        }),
      );
    } else {
      unlogSlot(meal, () =>
        snackbar.show({
          message: `Removed ${meal.mealType}`,
          actionLabel: 'Undo',
          onAction: () => logSlot(meal, portion),
        }),
      );
    }
  };

  const setPortion = (meal: PlannedRow, portion: PortionKey) => logSlot(meal, portion);

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
  };

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
          snackbar.show({
            message: `Deleted ${row.name}`,
            actionLabel: entryId ? 'Undo' : undefined,
            onAction: entryId
              ? () =>
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
                      ...(row.replacesSlot && { replacesSlot: row.replacesSlot }),
                    },
                  })
              : undefined,
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
      { fromDate: copyFromDateStr, toDate: dateStr, ...REBALANCE_PREVIEW },
      {
        onSuccess: (result) => {
          recordRebalanceOutcome(result);
          invalidateDayQueries(utils); // both the source and target dates
          setCopyDayOpen(false);
          snackbar.show({
            message: copyDayMessage(result.copiedEntryIds.length, copyLabel),
            actionLabel: result.copiedEntryIds.length > 0 ? 'Undo' : undefined,
            onAction:
              result.copiedEntryIds.length > 0
                ? () =>
                    deleteEntriesMutation.mutate({ date: dateStr, entryIds: result.copiedEntryIds })
                : undefined,
          });
        },
      },
    );
  };

  // Off-plan recipe rows (UX-FOOD-03): editable and removable like custom
  // entries — they used to be read-only, so a mis-log or a stale one could
  // never be fixed.
  const offPlanLogged = data?.offPlanLogged ?? [];
  const editingRecipeEntry = offPlanLogged.find((m) => m.entryId === editingRecipeEntryId) ?? null;
  const deleteOffPlanEntry = (row: (typeof offPlanLogged)[number]) => {
    const entryId = row.entryId;
    if (!entryId) return;
    deleteEntriesMutation.mutate(
      { date: dateStr, entryIds: [entryId] },
      {
        onSuccess: () => {
          setEditingRecipeEntryId(null);
          snackbar.show({
            message: `Deleted ${row.recipeName}`,
            actionLabel: 'Undo',
            // The entry is re-logged exactly as it was (recipe, meal, portion).
            onAction: () =>
              logRecipeMutation.mutate({
                date: dateStr,
                ...REBALANCE_PREVIEW,
                recipeId: row.recipeId,
                mealType: row.mealType,
                portionMultiplier: row.portionMultiplier ?? 1,
              }),
          });
        },
      },
    );
  };

  // A replacement sits on its slot ("You had: …"), so it is not listed again
  // here. One whose slot is gone from the plan (regenerated since) still is.
  const customRows = customEntryRows(loggedMeals).filter((r) => !replacedIndexes.has(r.entryIndex));

  // UX-FOOD-25: off-plan recipes and custom entries are ONE "Also eaten" list,
  // grouped under the meal they belong to (they were two stacked sections
  // with the same header, and the custom rows sat under the Snap upsell).
  const alsoEaten = groupByMeal([
    ...offPlanLogged.map((m) => ({ kind: 'recipe' as const, mealType: m.mealType, m })),
    ...customRows.map((row) => ({ kind: 'custom' as const, mealType: row.mealType, row })),
  ]);

  const checked = (key: string) => ticks[key]?.checked ?? false;
  const portionOf = (m: { key: string; portion?: number }): PortionKey =>
    ticks[m.key]?.portion ?? planPortionOf(m);

  // The day's totals are whatever the log holds — planned ticks, custom
  // entries and off-plan recipes alike (the server's own definition).
  const {
    kcal: loggedKcal,
    protein: loggedProtein,
    carbs: loggedCarbs,
    fat: loggedFat,
  } = sumLogged(loggedMeals);

  return {
    snap,
    copy,
    snackbar,
    utils,
    selectedDate,
    setSelectedDate,
    dateStr,
    todayStr,
    isToday,
    isFuture,
    data,
    isLoading,
    isError,
    refetch,
    dayTargets,
    proteinOnly,
    slotFlow,
    average,
    quickAddOpen,
    setQuickAddOpen,
    explainOpen,
    setExplainOpen,
    copyDayOpen,
    setCopyDayOpen,
    editingEntry,
    setEditingEntry,
    editingRecipeEntryId,
    setEditingRecipeEntryId,
    targetsView,
    ticks,
    logRecipeMutation,
    unlogRecipeMutation,
    deleteCustomMutation,
    deleteEntriesMutation,
    restoreCustomMutation,
    updateRecipeEntryMutation,
    copyDayMutation,
    planned,
    loggedMeals,
    states,
    replacedEntries,
    logSlot,
    unlogSlot,
    toggleMeal,
    setPortion,
    changeDate,
    deleteCustomEntry,
    copyFromDate,
    copyFromDateStr,
    copyLabel,
    confirmCopyDay,
    offPlanLogged,
    editingRecipeEntry,
    deleteOffPlanEntry,
    customRows,
    alsoEaten,
    checked,
    portionOf,
    loggedKcal,
    loggedProtein,
    loggedCarbs,
    loggedFat,
  };
}

export type TrackerDay = ReturnType<typeof useTrackerDay>;
