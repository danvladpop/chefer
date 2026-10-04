import { useSnackbar } from '@chefer/ui-mobile';
import {
  userFacingErrorMessage,
  withEntriesRemoved,
  withEntryRestored,
  withSlotReplaced,
  withSlotSkipped,
  withSlotUnskipped,
  type DayEntry,
  type SlotRef,
} from '@chefer/utils';
import { trackMealLogged } from '../../lib/analytics-events';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { invalidateDayQueries } from './invalidate';
import { recordRebalance } from './rebalance-store';
import { replacedMessage, skippedMessage, toLogMealType } from './slot-copy';
import { WRITE_SCOPE } from './use-tracker-writes';

// The writes behind "Ate something else" and "Skipped it" (WP-06). Same model
// as useTrackerWrites: the cached `tracker.getDay` is edited FIRST with the
// shared pure helpers (withSlotReplaced / withSlotSkipped / withSlotUnskipped),
// put back when the server says no (with the reason in plain words), and
// re-fetched when the write settles. Writes share the tracker's scope so they
// reach the server in the order the user made them. Every success hands the
// result to the rebalance store and refreshes Today, the tracker and Plan.

type Day = RouterOutputs['tracker']['getDay'];
type Snapshot = { previous: Day | undefined } | undefined;

/** A replacement that is already in the log (for Remove / its Undo). */
export type ReplacementEntry = {
  entryId: string;
  name: string;
  estimatedBy: 'vision' | 'manual';
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknownMacros?: readonly ('protein' | 'carbs' | 'fat')[] | undefined;
  replacesSlot: SlotRef;
};

/** What "Ate something else" logs against a plan slot. */
export type ReplaceInput = {
  slot: SlotRef;
  name: string;
  estimatedBy: 'vision' | 'manual';
  kcal: number;
  protein: number;
  carbs?: number;
  fat?: number;
  unknownMacros?: readonly ('protein' | 'carbs' | 'fat')[];
};

export function useSlotActions(dateStr: string) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const key = { date: dateStr };

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

  const logCustom = trpc.tracker.logCustomMeal.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) => {
        if (!vars.replacesSlot) return day;
        const entry: DayEntry & { replacesSlot: SlotRef } = {
          custom: { name: vars.name, estimatedBy: vars.estimatedBy },
          mealType: vars.replacesSlot.mealType,
          replacesSlot: vars.replacesSlot,
          portionMultiplier: 1,
          kcal: vars.kcal,
          protein: vars.protein ?? 0,
          carbs: vars.carbs ?? 0,
          fat: vars.fat ?? 0,
        };
        return withSlotReplaced(day, entry);
      }),
    onError: (error, _vars, snapshot) => {
      rollback(snapshot);
      failed("Couldn't log that.", error);
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
      failed("Couldn't remove that.", error);
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

  const skipMutation = trpc.tracker.skipSlot.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) =>
        withSlotSkipped(day, { mealType: vars.mealType, slotIndex: vars.slotIndex }),
      ),
    onError: (error, vars, snapshot) => {
      rollback(snapshot);
      failed(`Couldn't skip ${vars.mealType}.`, error);
    },
    onSettled: settle,
  });

  const unskipMutation = trpc.tracker.unskipSlot.useMutation({
    meta: { silent: true },
    scope: WRITE_SCOPE,
    onMutate: (vars): Promise<Snapshot> =>
      applyOptimistic((day) =>
        withSlotUnskipped(day, { mealType: vars.mealType, slotIndex: vars.slotIndex }),
      ),
    onError: (error, vars, snapshot) => {
      rollback(snapshot);
      failed(`Couldn't undo skipping ${vars.mealType}.`, error);
    },
    onSettled: settle,
  });

  /** The Undo of a replacement: delete exactly the entry just written (restores the slot). */
  const undoReplacement = (entryId: string) =>
    deleteEntries.mutate({ date: dateStr, entryIds: [entryId] });

  /**
   * The snackbar after a replacement was logged — by this hook, or by the Describe flow's own
   * sheet, which logs through its own mutation. Undo deletes exactly that entry.
   */
  const confirmReplaced = (name: string, mealType: string, entryId: string | undefined): void =>
    snackbar.show({
      message: replacedMessage(name, mealType),
      tone: 'success',
      ...(entryId && { actionLabel: 'Undo', onAction: () => undoReplacement(entryId) }),
    });

  /** "Ate something else": log a custom entry that takes over `slot`, with Undo. */
  const replaceSlot = (input: ReplaceInput, onLogged?: () => void): void => {
    logCustom.mutate(
      {
        date: dateStr,
        name: input.name,
        estimatedBy: input.estimatedBy,
        mealType: toLogMealType(input.slot.mealType),
        kcal: input.kcal,
        protein: input.protein,
        carbs: input.carbs ?? 0,
        fat: input.fat ?? 0,
        ...(input.unknownMacros &&
          input.unknownMacros.length > 0 && { unknownMacros: [...input.unknownMacros] }),
        replacesSlot: { mealType: input.slot.mealType, slotIndex: input.slot.slotIndex },
      },
      {
        onSuccess: (result) => {
          trackMealLogged('replaced', input.slot.mealType);
          recordRebalance(result.rebalance);
          onLogged?.();
          confirmReplaced(input.name, input.slot.mealType, result.entryId);
        },
      },
    );
  };

  /** "Remove" on a replaced slot: the planned meal comes back; Undo re-adds the replacement. */
  const removeReplacement = (entry: ReplacementEntry): void => {
    deleteEntries.mutate(
      { date: dateStr, entryIds: [entry.entryId] },
      {
        onSuccess: () =>
          snackbar.show({
            message: `Removed ${entry.name}`,
            actionLabel: 'Undo',
            onAction: () =>
              restoreCustom.mutate({
                date: dateStr,
                entry: {
                  entryId: entry.entryId,
                  custom: { name: entry.name, estimatedBy: entry.estimatedBy },
                  mealType: entry.replacesSlot.mealType,
                  portionMultiplier: 1,
                  kcal: entry.kcal,
                  protein: entry.protein,
                  carbs: entry.carbs,
                  fat: entry.fat,
                  ...(entry.unknownMacros && { unknownMacros: [...entry.unknownMacros] }),
                  replacesSlot: entry.replacesSlot,
                },
              }),
          }),
      },
    );
  };

  /** Take a skip back (the "Undo" on a skipped slot, and the snackbar's Undo). */
  const unskipSlot = (slot: SlotRef): void =>
    unskipMutation.mutate({ date: dateStr, mealType: slot.mealType, slotIndex: slot.slotIndex });

  /**
   * "Remove" where only the entry's id is known (Today's summary): reads the day's
   * log for the full entry first, so the Undo can put it back exactly as it was.
   */
  const removeReplacementById = (entryId: string): void => {
    void utils.tracker.getDay
      .fetch(key)
      .then((day) => {
        const entry = day.log?.loggedMeals.find((m) => m.entryId === entryId);
        if (!entry?.custom || !entry.replacesSlot) {
          deleteEntries.mutate({ date: dateStr, entryIds: [entryId] });
          return;
        }
        removeReplacement({
          entryId,
          name: entry.custom.name,
          estimatedBy: entry.custom.estimatedBy,
          kcal: entry.kcal,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          unknownMacros: entry.unknownMacros,
          replacesSlot: entry.replacesSlot,
        });
      })
      .catch((error: unknown) => failed("Couldn't remove that.", error));
  };

  /** "Skipped it": the slot is neither eaten nor remaining; Undo puts it back. */
  const skipSlot = (slot: SlotRef): void => {
    skipMutation.mutate(
      { date: dateStr, mealType: slot.mealType, slotIndex: slot.slotIndex },
      {
        onSuccess: (result) => {
          recordRebalance(result.rebalance);
          snackbar.show({
            message: skippedMessage(slot.mealType),
            actionLabel: 'Undo',
            onAction: () => unskipSlot(slot),
          });
        },
      },
    );
  };

  return {
    replaceSlot,
    confirmReplaced,
    removeReplacement,
    removeReplacementById,
    skipSlot,
    unskipSlot,
    pending:
      logCustom.isPending ||
      deleteEntries.isPending ||
      restoreCustom.isPending ||
      skipMutation.isPending ||
      unskipMutation.isPending,
  };
}
