import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ChatAction } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { cn, userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { invalidateDayQueries } from '../tracker/invalidate';

// UX-FOOD-21: when the chef changes something (swaps a meal, adds to the
// shopping list, logs what you ate, imports a recipe) the reply carries a chip
// saying so, with View (go and look) and Undo (put it back). Until now the
// only sign was a sentence the model chose to write.

/** Where View goes for an action. Pure: also what the tests assert. */
export function viewTargetFor(action: ChatAction): Parameters<typeof router.push>[0] {
  switch (action.kind) {
    case 'swap':
      return {
        pathname: '/(food)/meal-plan',
        params: { week: '0', day: String(action.dayOfWeek), at: String(Date.now()) },
      };
    case 'shopping':
      return '/(food)/shopping-list';
    case 'logged':
      return '/tracker';
    case 'imported':
      return { pathname: '/recipe/[id]', params: { id: action.recipeId } };
  }
}

/** Whether an action can be put back. A swap into an empty slot, or an import, cannot. */
export function canUndo(action: ChatAction): boolean {
  switch (action.kind) {
    case 'swap':
      return action.previousRecipeId !== undefined;
    case 'shopping':
      return action.keys.length > 0;
    case 'logged':
      return true;
    case 'imported':
      return false;
  }
}

function Chip({
  testID,
  action,
  undone,
  onUndone,
}: {
  testID: string;
  action: ChatAction;
  undone: boolean;
  onUndone: () => void;
}) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceRecipe = trpc.mealPlan.replaceRecipe.useMutation({ meta: { silent: true } });
  const removeCustomItem = trpc.shoppingList.removeCustomItem.useMutation({
    meta: { silent: true },
  });
  const deleteEntries = trpc.tracker.deleteEntries.useMutation({ meta: { silent: true } });

  const undo = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'swap' && action.previousRecipeId) {
        await replaceRecipe.mutateAsync({
          planId: action.planId,
          dayOfWeek: action.dayOfWeek,
          mealType: action.mealType,
          slotIndex: action.slotIndex,
          recipeId: action.previousRecipeId,
        });
        void utils.mealPlan.invalidate();
        void utils.dashboard.summary.invalidate();
        void utils.shoppingList.invalidate();
        void utils.tracker.invalidate();
      } else if (action.kind === 'shopping') {
        for (const key of action.keys) {
          await removeCustomItem.mutateAsync({ planId: action.planId, key });
        }
        void utils.shoppingList.invalidate();
      } else if (action.kind === 'logged') {
        // The logged entry's id is assigned when the day is read: find it there.
        const day = await utils.tracker.getDay.fetch({ date: action.date });
        const entry = [...(day.log?.loggedMeals ?? [])]
          .reverse()
          .find((m) => m.custom?.name === action.name && Math.round(m.kcal) === action.kcal);
        if (entry?.entryId) {
          await deleteEntries.mutateAsync({ date: action.date, entryIds: [entry.entryId] });
        }
        invalidateDayQueries(utils, action.date);
      }
      onUndone();
    } catch (err) {
      setError(`Couldn't undo that. ${userFacingErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const showUndo = canUndo(action) && !undone;
  return (
    <View testID={testID} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
      <View className="flex-row items-center gap-2">
        <Ionicons
          name={undone ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
          size={18}
          color="#047857"
        />
        <Text
          testID={`${testID}-label`}
          className={cn(
            'min-w-0 flex-1 text-sm text-emerald-900',
            undone && 'text-emerald-800 line-through',
          )}
        >
          {action.label}
        </Text>
      </View>
      <View className="flex-row items-center">
        {undone ? (
          <Text testID={`${testID}-undone`} className="min-h-11 py-3 text-sm text-emerald-800">
            Undone
          </Text>
        ) : (
          <>
            <Pressable
              testID={`${testID}-view`}
              accessibilityRole="button"
              accessibilityLabel={`View: ${action.label}`}
              onPress={() => router.push(viewTargetFor(action))}
              className="min-h-11 justify-center pr-5"
            >
              <Text className="text-sm font-semibold text-primary">View</Text>
            </Pressable>
            {showUndo && (
              <Pressable
                testID={`${testID}-undo`}
                accessibilityRole="button"
                accessibilityLabel={`Undo: ${action.label}`}
                disabled={busy}
                onPress={() => void undo()}
                className={cn('min-h-11 justify-center pr-5', busy && 'opacity-40')}
              >
                <Text className="text-sm font-semibold text-primary">
                  {busy ? 'Undoing…' : 'Undo'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>
      {error && (
        <Text testID={`${testID}-error`} className="pb-1 text-xs text-red-600">
          {error}
        </Text>
      )}
    </View>
  );
}

export function ChatActionChips({
  messageId,
  actions,
  undone,
  onUndone,
}: {
  messageId: number;
  actions: readonly ChatAction[];
  undone: readonly number[];
  onUndone: (index: number) => void;
}) {
  return (
    <View className="mt-1.5 gap-1.5">
      {actions.map((action, index) => (
        <Chip
          key={`${action.kind}-${index}`}
          testID={`chat-action-${messageId}-${index}`}
          action={action}
          undone={undone.includes(index)}
          onUndone={() => onUndone(index)}
        />
      ))}
    </View>
  );
}
