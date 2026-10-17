import { useSnackbar } from '@chefer/ui-mobile';
import {
  userFacingErrorMessage,
  withEntriesRemoved,
  withEntryRestored,
  withRecipeEntryEdited,
  withRecipeLogged,
  withRecipeUnlogged,
  type DayEntry,
} from '@chefer/utils';
import { trackMealLogged } from '../../lib/analytics-events';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { invalidateDayQueries } from './invalidate';
import { recordRebalanceOutcome } from './rebalance-offer-store';

// Every write the tracker makes to a day (UX-FOOD-01, UX-FOOD-06).
//
// The screen derives its ticks and totals from the cached `tracker.getDay`
// data, so a write EDITS that cache first (optimistic), puts it back when the
// server says no, and re-fetches when it settles. Writes are serialised
// (mutation `scope`), so a quick tick-then-untick reaches the server in the
// order the user made them. A failed write never leaves a success on screen:
// the cache rolls back and the snackbar says why, in plain words.

type Day = RouterOutputs['tracker']['getDay'];
type Snapshot = { previous: Day | undefined } | undefined;

/** One scope for every tracker write: same id → run one after another. */
export const WRITE_SCOPE = { id: 'tracker-day-writes' };

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function useTrackerWrites(dateStr: string) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const key = { date: dateStr };

  /** Applies `update` to the cached day now; returns what to roll back to. */
  const applyOptimistic = async (update: (day: Day) => Day): Promise<Snapshot> => {
    await utils.tracker.getDay.cancel(key);
    const previous = utils.tracker.getDay.getData(key);
    if (previous) utils.tracker.getDay.setData(key, update(previous));
    return { previous };
  };
  const rollback = (snapshot: Snapshot): void => {
    if (snapshot?.previous) utils.tracker.getDay.setData(key, snapshot.previous);
  };
  const failed = (what: string, error: unknown): void =>
    snackbar.show({ message: `${what} ${userFacingErrorMessage(error)}` });
  const settle = (): void => invalidateDayQueries(utils, dateStr);

  const logRecipe = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) => {
        // The tracker only ticks planned rows, so the macros come from the plan.
        const planned = day.plannedMeals.find(
          (m) =>
            m.recipeId === vars.recipeId &&
            (vars.slotIndex === undefined
              ? m.mealType === vars.mealType
              : m.slotIndex === vars.slotIndex),
        );
        if (!planned) return day;
        const p = vars.portionMultiplier ?? 1;
        const entry: DayEntry = {
          recipeId: vars.recipeId,
          mealType: vars.mealType,
          ...(vars.slotIndex !== undefined && { slotIndex: vars.slotIndex }),
          portionMultiplier: p,
          kcal: Math.round(planned.kcal * p),
          protein: round1(planned.protein * p),
          carbs: round1(planned.carbs * p),
          fat: round1(planned.fat * p),
        };
        return withRecipeLogged(day, entry);
      }),
    onSuccess: (result, vars) => {
      // The tracker only ticks planned rows (WP-13).
      trackMealLogged('planned', vars.mealType);
      recordRebalanceOutcome(result);
    },
    onError: (error, vars, snapshot) => {
      rollback(snapshot);
      failed(`Couldn't log ${vars.mealType}.`, error);
    },
    onSettled: settle,
  });

  const unlogRecipe = trpc.tracker.unlogRecipe.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> => applyOptimistic((day) => withRecipeUnlogged(day, vars)),
    onError: (error, vars, snapshot) => {
      rollback(snapshot);
      failed(`Couldn't remove ${vars.mealType}.`, error);
    },
    onSettled: settle,
  });

  const deleteCustom = trpc.tracker.deleteCustomMeal.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) =>
        withEntriesRemoved(day, {
          ...(vars.entryId !== undefined && { entryIds: [vars.entryId] }),
          ...(vars.entryId === undefined &&
            vars.entryIndex !== undefined && { entryIndex: vars.entryIndex }),
        }),
      ),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      failed("Couldn't delete that entry.", error);
    },
    onSettled: settle,
  });

  const deleteEntries = trpc.tracker.deleteEntries.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) => withEntriesRemoved(day, { entryIds: vars.entryIds })),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      failed("Couldn't undo that.", error);
    },
    onSettled: settle,
  });

  const restoreCustom = trpc.tracker.restoreCustomMeal.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) => withEntryRestored(day, vars.entry)),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      failed("Couldn't bring that back.", error);
    },
    onSettled: settle,
  });

  const updateRecipeEntry = trpc.tracker.updateRecipeEntry.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) => {
        const row = day.offPlanLogged.find((o) => o.entryId === vars.entryId);
        if (!row) return day;
        const was = row.portionMultiplier ?? 1;
        return withRecipeEntryEdited(
          day,
          vars.entryId,
          { portionMultiplier: vars.portionMultiplier, mealType: vars.mealType },
          {
            kcal: row.kcal / was,
            protein: row.protein / was,
            carbs: row.carbs / was,
            fat: row.fat / was,
          },
        );
      }),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      failed("Couldn't save that change.", error);
    },
    onSettled: settle,
  });

  return { logRecipe, unlogRecipe, deleteCustom, deleteEntries, restoreCustom, updateRecipeEntry };
}
