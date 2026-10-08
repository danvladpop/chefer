'use client';

import Link from 'next/link';
import { useState } from 'react';
import { invalidateDayQueries } from '@/features/tracker/lib/invalidate';
import { trpc } from '@/lib/trpc';
import { CheckCircle2, Undo2 } from 'lucide-react';
import type { ChatAction } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';

// UX-FOOD-21 (web counterpart of the app's chip): when the chef changes
// something, the reply says so with View (go and look) and Undo (put it back).

/** Where View goes for an action. */
export function viewHrefFor(action: ChatAction): string {
  switch (action.kind) {
    case 'swap':
      return `/meal-plan?week=0&day=${action.dayOfWeek}`;
    case 'shopping':
      return '/shopping-list';
    case 'logged':
      return '/tracker';
    case 'imported':
      return `/recipes/${action.recipeId}`;
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
  testId,
  action,
  undone,
  onUndone,
  onNavigate,
}: {
  testId: string;
  action: ChatAction;
  undone: boolean;
  onUndone: () => void;
  onNavigate: () => void;
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

  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
    >
      <p className="flex items-start gap-2">
        {undone ? (
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className={`min-w-0 ${undone ? 'line-through' : ''}`}>{action.label}</span>
      </p>
      <div className="flex items-center gap-4">
        {undone ? (
          <span className="flex min-h-11 items-center text-xs text-emerald-800">Undone</span>
        ) : (
          <>
            <Link
              href={viewHrefFor(action)}
              onClick={onNavigate}
              aria-label={`View: ${action.label}`}
              className="flex min-h-11 items-center text-xs font-semibold text-[#944a00] underline-offset-2 hover:underline"
            >
              View
            </Link>
            {canUndo(action) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void undo()}
                aria-label={`Undo: ${action.label}`}
                className="flex min-h-11 items-center text-xs font-semibold text-[#944a00] underline-offset-2 hover:underline disabled:opacity-40"
              >
                {busy ? 'Undoing…' : 'Undo'}
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="pb-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function ChatActionChips({
  messageId,
  actions,
  undone,
  onUndone,
  onNavigate,
}: {
  messageId: string;
  actions: readonly ChatAction[];
  undone: readonly number[];
  onUndone: (index: number) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="ml-8 flex max-w-[80%] flex-col gap-1.5">
      {actions.map((action, index) => (
        <Chip
          key={`${action.kind}-${index}`}
          testId={`chat-action-${messageId}-${index}`}
          action={action}
          undone={undone.includes(index)}
          onUndone={() => onUndone(index)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
