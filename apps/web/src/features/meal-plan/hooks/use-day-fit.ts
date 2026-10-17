'use client';

import { useEffect, useState } from 'react';
import type { ReplaceMealResult } from '@/features/meal-plan/components/ReplaceMealSheet';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { planSlotMealTypeSchema } from '@chefer/types';
import { DAY_FIT_COPY, describeDayFit, localDateStr, userFacingErrorMessage } from '@chefer/utils';

// ─── Day rebalance on the Meals page (2026-10-16) ─────────────────────────────
// A swap/replace comes back with `dayFit`: the server already resized the
// day's other open meals so the day stays on its target. This hook turns that
// answer into what the page shows:
// - a toast naming what was resized (`describeDayFit`) with an Undo that puts
//   the old recipe back WITHOUT a new fit (`fitDay: false`) and then restores
//   the day's portions exactly (`restoreDayPortions`);
// - an "adjusted" marker on the resized cards until the user changes day/week
//   (or reloads — it is plain component state);
// - the one-change suggestion when portions alone could not close the day
//   (board DayFitSuggest), kept for that plan + day only.
// Copy is the shared `@chefer/utils` day-fit copy, so web and mobile read alike.

export type DayFitOutcome = NonNullable<
  RouterOutputs['mealPlan']['applyDayFitSuggestion']['dayFit']
>;
export type DayFitSuggestion = NonNullable<DayFitOutcome['suggestion']>;

type ShowToast = (message: string, action?: { label: string; onClick: () => void }) => void;

export interface DaySuggestionState {
  planId: string;
  dayOfWeek: number;
  /** The day's kcal after the resize (the suggestion card's lede quotes it). */
  kcal: number;
  suggestion: DayFitSuggestion;
}

interface AdjustedState {
  planId: string;
  dayOfWeek: number;
  slots: ReadonlySet<number>;
}

export interface UseDayFitOptions {
  /** The plan on screen. */
  planId: string | undefined;
  /** 0 = Monday … 6 = Sunday when the plan is this week, else null. */
  todayDayOfWeek: number | null;
  /**
   * Changes whenever the user moves to another day or week — the adjusted
   * marker is for the view the change happened in only.
   */
  viewKey: string;
  showToast: ShowToast;
  /** Refetch the plan and everything derived from it (dashboard, tracker, shopping). */
  onPlanChanged: () => void;
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('data' in err)) return undefined;
  const data = (err as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

export function useDayFit({
  planId,
  todayDayOfWeek,
  viewKey,
  showToast,
  onPlanChanged,
}: UseDayFitOptions) {
  const [adjusted, setAdjusted] = useState<AdjustedState | null>(null);
  const [suggestion, setSuggestion] = useState<DaySuggestionState | null>(null);
  const [applying, setApplying] = useState(false);

  // The marker belongs to the view the change happened in.
  useEffect(() => setAdjusted(null), [viewKey]);

  const replaceRecipe = trpc.mealPlan.replaceRecipe.useMutation({ meta: { silent: true } });
  const restorePortions = trpc.mealPlan.restoreDayPortions.useMutation({ meta: { silent: true } });
  const applyMutation = trpc.mealPlan.applyDayFitSuggestion.useMutation({
    meta: { silent: true },
  });
  const undoAdd = trpc.recipe.undoAddToWeek.useMutation({ meta: { silent: true } });

  const restore = async (fitPlanId: string, dayOfWeek: number, portions: readonly number[]) => {
    if (portions.length === 0) return;
    await restorePortions.mutateAsync({ planId: fitPlanId, dayOfWeek, portions: [...portions] });
  };

  /** Runs an Undo: clears this day's marker + suggestion, refetches, says why when it fails. */
  const runUndo = async (dayOfWeek: number, steps: () => Promise<void>) => {
    try {
      await steps();
    } catch (err) {
      showToast(`Couldn't undo that. ${userFacingErrorMessage(err)}`);
    } finally {
      setAdjusted((a) => (a?.dayOfWeek === dayOfWeek ? null : a));
      setSuggestion((s) => (s?.dayOfWeek === dayOfWeek ? null : s));
      onPlanChanged();
    }
  };

  const markAdjusted = (fit: DayFitOutcome) => {
    setAdjusted(
      fit.changes.length > 0
        ? {
            planId: fit.planId,
            dayOfWeek: fit.dayOfWeek,
            slots: new Set(fit.changes.map((c) => c.slotIndex)),
          }
        : null,
    );
  };

  /** Keeps the day's suggestion in step with the latest fit of that day. */
  const trackSuggestion = (fit: DayFitOutcome | null | undefined, fitPlanId: string, day: number) =>
    setSuggestion((prev) => {
      if (fit?.suggestion) {
        return {
          planId: fit.planId,
          dayOfWeek: fit.dayOfWeek,
          kcal: fit.kcal,
          suggestion: fit.suggestion,
        };
      }
      return prev?.planId === fitPlanId && prev.dayOfWeek === day ? null : prev;
    });

  /** The ReplaceMealSheet's `onChanged`: the toast (+ Undo), the marker and the suggestion. */
  const onSlotChanged = ({
    recipeName,
    previousRecipeId,
    previousPinned,
    target,
    dayFit,
  }: ReplaceMealResult) => {
    const type = planSlotMealTypeSchema.safeParse(target.mealType);
    const putBack = async () => {
      if (!previousRecipeId || !type.success) return;
      await replaceRecipe.mutateAsync({
        planId: target.planId,
        dayOfWeek: target.dayOfWeek,
        mealType: type.data,
        slotIndex: target.slotIndex,
        recipeId: previousRecipeId,
        // UX-PLAN-04: restore the slot's previous pin state.
        pinned: previousPinned === true,
        // Undo is a put-back, not a new swap: no second fit of the day.
        fitDay: false,
      });
    };

    trackSuggestion(dayFit, target.planId, target.dayOfWeek);
    const line = describeDayFit(dayFit, { isToday: target.dayOfWeek === todayDayOfWeek });
    if (dayFit && line) {
      markAdjusted(dayFit);
      const fit = dayFit;
      showToast(
        line,
        previousRecipeId
          ? {
              label: DAY_FIT_COPY.undo,
              onClick: () =>
                void runUndo(target.dayOfWeek, async () => {
                  await putBack();
                  await restore(fit.planId, fit.dayOfWeek, fit.previousPortions);
                }),
            }
          : undefined,
      );
      return;
    }
    showToast(
      `Swapped to ${recipeName}`,
      previousRecipeId
        ? { label: DAY_FIT_COPY.undo, onClick: () => void runUndo(target.dayOfWeek, putBack) }
        : undefined,
    );
  };

  /** "Swap breakfast" / "Add a snack" on the suggestion card. */
  const applySuggestion = async () => {
    const current = suggestion;
    if (!current || applying) return;
    const s = current.suggestion;
    const type = planSlotMealTypeSchema.safeParse(s.mealType);
    if (!type.success) return;
    setApplying(true);
    try {
      const result = await applyMutation.mutateAsync({
        planId: current.planId,
        dayOfWeek: current.dayOfWeek,
        kind: s.kind,
        mealType: type.data,
        recipeId: s.recipeId,
        ...(s.slotIndex !== undefined && { slotIndex: s.slotIndex }),
        localDate: localDateStr(),
      });
      setSuggestion(null);
      if (result.dayFit) {
        markAdjusted(result.dayFit);
        trackSuggestion(result.dayFit, current.planId, current.dayOfWeek);
      }
      onPlanChanged();
      const { undo, previousPortions } = result;
      showToast(DAY_FIT_COPY.suggestionApplied(s), {
        label: DAY_FIT_COPY.undo,
        onClick: () =>
          void runUndo(current.dayOfWeek, async () => {
            if (undo.kind === 'swap') {
              const undoType = planSlotMealTypeSchema.safeParse(undo.mealType);
              if (undoType.success) {
                await replaceRecipe.mutateAsync({
                  planId: current.planId,
                  dayOfWeek: current.dayOfWeek,
                  mealType: undoType.data,
                  slotIndex: undo.slotIndex,
                  recipeId: undo.previousRecipeId,
                  pinned: false,
                  fitDay: false,
                });
              }
            } else {
              // The added snack comes back out. `recipe.undoAddToWeek` removes
              // exactly the slot the add created (even when it is the day's
              // only snack, which `mealPlan.removeSlot` refuses).
              await undoAdd.mutateAsync({
                planId: current.planId,
                dayOfWeek: current.dayOfWeek,
                mealType: 'snack',
                slotIndex: undo.slotIndex,
                addedRecipeId: s.recipeId,
              });
            }
            await restore(current.planId, current.dayOfWeek, previousPortions);
          }),
      });
    } catch (err) {
      if (errorCode(err) === 'CONFLICT') {
        setSuggestion(null);
        showToast(DAY_FIT_COPY.stale);
        onPlanChanged();
      } else {
        showToast(userFacingErrorMessage(err));
      }
    } finally {
      setApplying(false);
    }
  };

  /** "Leave it": the suggestion goes away; nothing changes. */
  const leaveSuggestion = () => setSuggestion(null);

  return {
    /** Slots of `dayOfWeek` the last fit resized (the "adjusted" marker), if any. */
    adjustedSlots: (dayOfWeek: number): ReadonlySet<number> | undefined =>
      adjusted && adjusted.planId === planId && adjusted.dayOfWeek === dayOfWeek
        ? adjusted.slots
        : undefined,
    /** The one-change suggestion for `dayOfWeek` of the plan on screen, if any. */
    suggestionFor: (dayOfWeek: number): DaySuggestionState | null =>
      suggestion && suggestion.planId === planId && suggestion.dayOfWeek === dayOfWeek
        ? suggestion
        : null,
    onSlotChanged,
    applySuggestion,
    leaveSuggestion,
    applying,
  };
}
