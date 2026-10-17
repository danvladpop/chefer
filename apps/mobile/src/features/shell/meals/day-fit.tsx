import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  IconButton,
  PressableScale,
  showSnackbar,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  DAY_FIT_COPY,
  dayFitSuggestionCopy,
  describeDayFit,
  localDateStr,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc, type RouterOutputs } from '../../../lib/trpc';

// Day rebalance (boards: canvas page "Day rebalance — proposal", 2026-10-16).
// A swap/replace already resized the day's other open meals on the server
// (`dayFit` on the response); this says what changed with Undo, marks the
// resized meals, offers the one-change suggestion when portions alone could
// not reach the day, and shows the "portions updated for your new targets"
// notice after a target change.

export type DayFit = NonNullable<RouterOutputs['mealPlan']['replaceRecipe']['dayFit']>;
type Suggestion = NonNullable<DayFit['suggestion']>;

interface SlotTarget {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  slotIndex: number;
}

/** The client's today, so the server's "today" is the user's. */
export function dayFitLocalDate(): string {
  return localDateStr(new Date());
}

export function useDayFit({
  planId,
  todayIndex,
  onChanged,
}: {
  planId: string | null;
  /** 0–6 when the shown week is this week, else null. */
  todayIndex: number | null;
  onChanged: () => void;
}) {
  const [adjusted, setAdjusted] = useState<{
    planId: string;
    dayOfWeek: number;
    slots: number[];
  } | null>(null);
  const [suggestion, setSuggestion] = useState<{
    planId: string;
    dayOfWeek: number;
    kcal: number;
    s: Suggestion;
  } | null>(null);

  const silent = { meta: { silent: true } } as const;
  const replace = trpc.mealPlan.replaceRecipe.useMutation(silent);
  const restore = trpc.mealPlan.restoreDayPortions.useMutation(silent);
  const undoAdd = trpc.recipe.undoAddToWeek.useMutation(silent);
  const apply = trpc.mealPlan.applyDayFitSuggestion.useMutation(silent);

  const fail = (err: unknown) => showSnackbar({ message: userFacingErrorMessage(err) });

  /** Undo a slot change: the recipe back (no new fit), then the day's portions. */
  const undoSlotChange = async (
    target: SlotTarget,
    dayOfWeek: number,
    previousRecipeId: string,
    previousPinned: boolean,
    previousPortions: readonly number[] | null,
  ) => {
    if (!planId) return;
    try {
      await replace.mutateAsync({
        planId,
        dayOfWeek,
        mealType: target.mealType,
        slotIndex: target.slotIndex,
        recipeId: previousRecipeId,
        pinned: previousPinned,
        fitDay: false,
      });
      if (previousPortions) {
        await restore.mutateAsync({ planId, dayOfWeek, portions: [...previousPortions] });
      }
      setAdjusted(null);
      setSuggestion(null);
    } catch (err) {
      fail(err);
    } finally {
      onChanged();
    }
  };

  /**
   * After a swap/replace succeeded: the snackbar (what was resized, or the
   * usual "Swapped to …"), the resized markers and the suggestion.
   */
  const afterSlotChange = (
    data: {
      name: string;
      previousRecipeId?: string | undefined;
      previousPinned?: boolean | undefined;
      dayFit?: DayFit | null | undefined;
    },
    target: SlotTarget,
    dayOfWeek: number,
    fallbackMessage: string,
  ) => {
    const fit = data.dayFit ?? null;
    const resized = describeDayFit(fit, { isToday: todayIndex === dayOfWeek });
    const { previousRecipeId } = data;
    showSnackbar({
      message: resized ?? fallbackMessage,
      ...(previousRecipeId && {
        actionLabel: DAY_FIT_COPY.undo,
        onAction: () =>
          void undoSlotChange(
            target,
            dayOfWeek,
            previousRecipeId,
            data.previousPinned === true,
            fit && fit.changes.length > 0 ? fit.previousPortions : null,
          ),
      }),
    });
    setAdjusted(
      fit && fit.changes.length > 0 && planId
        ? { planId, dayOfWeek, slots: fit.changes.map((c) => c.slotIndex) }
        : null,
    );
    setSuggestion(
      fit?.suggestion && planId ? { planId, dayOfWeek, kcal: fit.kcal, s: fit.suggestion } : null,
    );
  };

  const applySuggestion = async () => {
    if (!suggestion) return;
    const { s, dayOfWeek } = suggestion;
    try {
      const res = await apply.mutateAsync({
        planId: suggestion.planId,
        dayOfWeek,
        kind: s.kind,
        mealType: s.mealType as SlotTarget['mealType'],
        recipeId: s.recipeId,
        ...(s.slotIndex !== undefined && { slotIndex: s.slotIndex }),
        localDate: dayFitLocalDate(),
      });
      setSuggestion(null);
      setAdjusted(
        res.dayFit && res.dayFit.changes.length > 0
          ? {
              planId: suggestion.planId,
              dayOfWeek,
              slots: res.dayFit.changes.map((c) => c.slotIndex),
            }
          : null,
      );
      showSnackbar({
        message: DAY_FIT_COPY.suggestionApplied(s),
        actionLabel: DAY_FIT_COPY.undo,
        onAction: () => void undoSuggestion(suggestion.planId, dayOfWeek, s, res),
        tone: 'success',
      });
    } catch (err) {
      setSuggestion(null);
      fail(err);
    } finally {
      onChanged();
    }
  };

  const undoSuggestion = async (
    pid: string,
    dayOfWeek: number,
    s: Suggestion,
    res: RouterOutputs['mealPlan']['applyDayFitSuggestion'],
  ) => {
    try {
      if (res.undo.kind === 'swap') {
        await replace.mutateAsync({
          planId: pid,
          dayOfWeek,
          mealType: res.undo.mealType as SlotTarget['mealType'],
          slotIndex: res.undo.slotIndex,
          recipeId: res.undo.previousRecipeId,
          pinned: false,
          fitDay: false,
        });
      } else {
        // Not `removeSlot`: it refuses the day's only snack, the usual case here.
        await undoAdd.mutateAsync({
          planId: pid,
          dayOfWeek,
          mealType: 'snack',
          slotIndex: res.undo.slotIndex,
          addedRecipeId: s.recipeId,
        });
      }
      await restore.mutateAsync({ planId: pid, dayOfWeek, portions: res.previousPortions });
      setAdjusted(null);
    } catch (err) {
      fail(err);
    } finally {
      onChanged();
    }
  };

  return {
    afterSlotChange,
    undoSlotChange,
    /** Slot indexes the last fit resized on `dayOfWeek` of `planId`. */
    adjustedSlots: (pid: string, dayOfWeek: number): readonly number[] =>
      adjusted?.planId === pid && adjusted.dayOfWeek === dayOfWeek ? adjusted.slots : [],
    suggestionFor: (pid: string, dayOfWeek: number) =>
      suggestion?.planId === pid && suggestion.dayOfWeek === dayOfWeek ? suggestion : null,
    applySuggestion,
    applying: apply.isPending,
    leaveSuggestion: () => setSuggestion(null),
  };
}

/** Board 2: portions alone can't reach the day — one change closes it. */
export function DayFitSuggestionCard({
  suggestion,
  dayOfWeek,
  kcal,
  onApply,
  onLeave,
  applying,
}: {
  suggestion: Suggestion;
  dayOfWeek: number;
  kcal: number;
  onApply: () => void;
  onLeave: () => void;
  applying: boolean;
}) {
  const copy = dayFitSuggestionCopy(suggestion, { dayOfWeek, kcal });
  return (
    <View testID="meals-dayfit-suggestion" className="gap-2.5 border-t border-separator pt-3">
      <Text className="text-subhead text-label-secondary">{copy.lede}</Text>
      <View className="flex-row items-center gap-2.5 rounded-control bg-brand-tint px-3 py-2.5">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-callout font-semibold text-label">{copy.title}</Text>
          <Text className="text-footnote text-label-secondary">{copy.detail}</Text>
        </View>
      </View>
      <Button testID="meals-dayfit-apply" loading={applying} onPress={onApply}>
        {copy.action}
      </Button>
      <PressableScale
        testID="meals-dayfit-leave"
        accessibilityRole="button"
        onPress={onLeave}
        className="min-h-11 items-center justify-center self-center px-3"
      >
        <Text className="text-subhead font-semibold text-label-secondary">
          {DAY_FIT_COPY.leaveIt}
        </Text>
      </PressableScale>
    </View>
  );
}

/** Board 4: a target change resized this plan's portions — say so once, with Undo. */
export function PortionRefitNotice({
  planId,
  days,
  onChanged,
}: {
  planId: string;
  days: number;
  onChanged: () => void;
}) {
  const colors = useThemeColors();
  const silent = { meta: { silent: true } } as const;
  const undo = trpc.mealPlan.undoPortionRefit.useMutation(silent);
  const dismiss = trpc.mealPlan.dismissPortionRefit.useMutation(silent);
  return (
    <View
      testID="meals-refit-notice"
      accessibilityRole="summary"
      className="flex-row items-start gap-2.5 rounded-card bg-brand-tint py-3 pl-3.5 pr-1"
    >
      <View className="pt-0.5">
        <Icon name="chef" color={colors.brand} size={22} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-callout font-semibold text-label">{DAY_FIT_COPY.refitTitle}</Text>
        <Text className="text-footnote text-label-secondary">{DAY_FIT_COPY.refitBody(days)}</Text>
        <PressableScale
          testID="meals-refit-undo"
          accessibilityRole="button"
          onPress={() =>
            undo.mutate(
              { planId },
              {
                onSuccess: () => showSnackbar({ message: DAY_FIT_COPY.refitUndone }),
                onError: (err) => showSnackbar({ message: userFacingErrorMessage(err) }),
                onSettled: onChanged,
              },
            )
          }
          className="min-h-11 justify-center self-start"
        >
          <Text className="text-subhead font-semibold text-brand">{DAY_FIT_COPY.undo}</Text>
        </PressableScale>
      </View>
      <IconButton
        testID="meals-refit-dismiss"
        accessibilityLabel={DAY_FIT_COPY.refitDismiss}
        icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
        onPress={() => dismiss.mutate({ planId }, { onSettled: onChanged })}
      />
    </View>
  );
}
