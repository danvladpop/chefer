'use client';

import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { QUICK_ADD_MEAL_TYPES, type QuickAddMealType, type SlotRef } from '@chefer/utils';
import { invalidateDayQueries } from './invalidate';
import { useTrackerWrites, type ShowToast } from './use-tracker-writes';

// ─── Flexible eating: "Ate something else" / "Skipped it" (WP-06) ─────────────
// One flow for every surface that shows a planned slot (Today's cards, the
// tracker row, the Plan day). A slot is eaten as planned (the tick), replaced
// by what you actually ate, or skipped; none of it is a failure, and each has
// an Undo. Writes are the tracker's own optimistic ones (use-tracker-writes):
// the cached day takes the change at once, rolls back with a plain-words
// message when the server says no, and re-fetches when it settles.

/** A plan slot the flow acts on: its ref plus the words to name it with. */
export type SlotTarget = SlotRef & {
  /** "Dinner" — how toasts and labels name the slot. */
  label: string;
};

/** What "Ate something else" logs in place of the planned meal. */
export type ReplacementInput = {
  name: string;
  kcal: number;
  protein?: number | undefined;
  carbs?: number | undefined;
  fat?: number | undefined;
  unknownMacros?: ('protein' | 'carbs' | 'fat')[] | undefined;
  estimatedBy?: 'vision' | 'manual' | undefined;
};

/** "dinner" → "Dinner". */
export const mealLabel = (mealType: string): string =>
  mealType.charAt(0).toUpperCase() + mealType.slice(1);

/** A slot's target from the plan's own fields. */
export const slotTargetOf = (mealType: string, slotIndex: number): SlotTarget => ({
  mealType,
  slotIndex,
  label: mealLabel(mealType),
});

const asMealType = (mealType: string): QuickAddMealType =>
  QUICK_ADD_MEAL_TYPES.find((t) => t === mealType) ?? 'snack';

export type SlotFlow = ReturnType<typeof useSlotActions>;

export function useSlotActions(dateStr: string, showToast: ShowToast) {
  const utils = trpc.useUtils();
  const writes = useTrackerWrites(dateStr, showToast);

  // The "Ate something else" sheet. `target` stays set while the describe /
  // photo flows (their own sheets) are open, so they know which slot they replace.
  const [target, setTarget] = useState<SlotTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [describeOpen, setDescribeOpen] = useState(false);
  // ScanMealButton hands its opener here (it must run inside the tap).
  const scanOpenRef = useRef<(() => void) | null>(null);

  const undoReplacement = (entryId: string, slot: SlotTarget) =>
    writes.deleteCustom.mutate(
      { date: dateStr, entryId },
      { onSuccess: () => showToast(`Back to your planned ${slot.label.toLowerCase()}`) },
    );

  /** Toast for a replacement the server accepted, with Undo (deletes that entry). */
  const confirmReplacement = (name: string, entryId: string | undefined, slot: SlotTarget) =>
    showToast(
      `Logged ${name} for ${slot.label.toLowerCase()}`,
      entryId ? { label: 'Undo', onClick: () => undoReplacement(entryId, slot) } : undefined,
    );

  const unskip = (slot: SlotTarget, quiet = false) =>
    writes.unskipSlot.mutate(
      { date: dateStr, mealType: slot.mealType, slotIndex: slot.slotIndex },
      quiet
        ? {}
        : { onSuccess: () => showToast(`Back to your planned ${slot.label.toLowerCase()}`) },
    );

  const skip = (slot: SlotTarget) =>
    writes.skipSlot.mutate(
      { date: dateStr, mealType: slot.mealType, slotIndex: slot.slotIndex },
      {
        onSuccess: () =>
          showToast(`Skipped ${slot.label.toLowerCase()}`, {
            label: 'Undo',
            onClick: () => unskip(slot, true),
          }),
      },
    );

  const replace = (slot: SlotTarget, input: ReplacementInput) =>
    writes.logReplacement.mutate(
      {
        date: dateStr,
        name: input.name,
        estimatedBy: input.estimatedBy ?? 'manual',
        mealType: asMealType(slot.mealType),
        kcal: input.kcal,
        protein: input.protein ?? 0,
        carbs: input.carbs ?? 0,
        fat: input.fat ?? 0,
        ...(input.unknownMacros && input.unknownMacros.length > 0
          ? { unknownMacros: input.unknownMacros }
          : {}),
        replacesSlot: { mealType: slot.mealType, slotIndex: slot.slotIndex },
      },
      { onSuccess: (result) => confirmReplacement(input.name, result.entryId, slot) },
    );

  return {
    /** The slot the open sheets are for. */
    target,
    sheetOpen,
    describeOpen,
    setDescribeOpen,
    scanOpenRef,
    /** Opens "Ate something else" for a slot. */
    openAteElse: (slot: SlotTarget) => {
      setTarget(slot);
      setSheetOpen(true);
    },
    closeSheet: () => setSheetOpen(false),
    /** "Describe it": the quick-add text flow, pre-targeted at the slot. */
    startDescribe: () => {
      setSheetOpen(false);
      setDescribeOpen(true);
    },
    /** "Snap a photo": the scan flow, pre-targeted at the slot (opens in this tap). */
    startSnap: () => {
      scanOpenRef.current?.();
      setSheetOpen(false);
    },
    skip,
    unskip: (slot: SlotTarget) => unskip(slot),
    replace,
    /** Undo of a replacement: deletes that custom entry, which restores the slot. */
    undoReplacement,
    /** For the describe / photo flows, which log their own entry. */
    onLoggedEntry: (entry: { entryId: string; name: string }) => {
      if (target) confirmReplacement(entry.name, entry.entryId, target);
    },
    onLogged: () => invalidateDayQueries(utils, dateStr),
    pending: writes.logReplacement.isPending,
  };
}
