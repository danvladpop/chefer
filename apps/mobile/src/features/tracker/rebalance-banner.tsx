import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn, isPendingFresh, rebalanceBannerCopy, undoOperations } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { clearPendingRebalance, usePendingRebalance } from './rebalance-store';

// Week-rebalance banner (F4, audit TRK-3) — mobile counterpart of web's
// meal-plan RebalanceBanner. Unlike web it also renders on the surface where
// the log happened (tracker, cook finish), so the user learns about the swap
// right away (F-TRK-3-2). Undo replays each slot's previous recipe through
// mealPlan.replaceRecipe; every mounted banner shares one store.

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealTypeName = (typeof MEAL_TYPES)[number];
const isMealType = (v: string): v is MealTypeName => (MEAL_TYPES as readonly string[]).includes(v);

export interface RebalanceBannerProps {
  /** When set (Plan tab), only swaps for the displayed plan show. */
  planId?: string | undefined;
  /** Called after an undo restored the previous recipes. */
  onUndone?: () => void;
  className?: string;
}

export function RebalanceBanner({ planId, onUndone, className }: RebalanceBannerProps) {
  const pending = usePendingRebalance();
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState(false);

  const utils = trpc.useUtils();
  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation();

  if (!pending || !isPendingFresh(pending) || (planId !== undefined && pending.planId !== planId)) {
    return null;
  }

  const undo = async () => {
    if (undoing) {
      return;
    }
    setUndoing(true);
    setUndoError(false);
    try {
      for (const op of undoOperations(pending)) {
        if (!isMealType(op.mealType)) {
          continue; // defensive — slots are always one of the four
        }
        await replaceMutation.mutateAsync({ ...op, mealType: op.mealType });
      }
      clearPendingRebalance();
      void utils.mealPlan.getForWeek.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.invalidate();
      void utils.shoppingList.invalidate();
      onUndone?.();
    } catch {
      setUndoError(true);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <View
      testID="rebalance-banner"
      accessibilityLiveRegion="polite"
      className={cn(
        'flex-row items-center gap-2 rounded-2xl border border-primary/20 bg-accent py-2 pl-3 pr-1',
        className,
      )}
    >
      <Ionicons name="color-wand-outline" size={18} color="#944a00" />
      <View className="min-w-0 flex-1">
        <Text testID="rebalance-banner-text" className="text-sm text-gray-800">
          {rebalanceBannerCopy(pending.swaps)}
        </Text>
        {undoError && (
          <Text testID="rebalance-undo-error" className="text-xs text-red-600">
            Undo failed — please try again.
          </Text>
        )}
      </View>
      <Pressable
        testID="rebalance-undo"
        accessibilityRole="button"
        accessibilityLabel="Undo meal plan changes"
        accessibilityState={{ disabled: undoing, busy: undoing }}
        disabled={undoing}
        onPress={() => void undo()}
        className={cn('h-11 flex-row items-center gap-1 rounded-xl px-2', undoing && 'opacity-50')}
      >
        <Ionicons name="arrow-undo-outline" size={16} color="#944a00" />
        <Text className="text-sm font-semibold text-primary">{undoing ? 'Undoing…' : 'Undo'}</Text>
      </Pressable>
      <Pressable
        testID="rebalance-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={clearPendingRebalance}
        className="h-11 w-11 items-center justify-center rounded-xl"
      >
        <Ionicons name="close" size={18} color="#9ca3af" />
      </Pressable>
    </View>
  );
}
