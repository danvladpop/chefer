'use client';

import { useEffect, useMemo, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Trash2 } from 'lucide-react';
import { SAVED_MEAL_LIMITS, SAVED_MEALS_COPY, savedMealNameSchema } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  copyMealMessage,
  copyMealTargetDays,
  defaultMealSlot,
  QUICK_ADD_MEAL_TYPES,
  savedMealSummary,
  userFacingErrorMessage,
  type QuickAddMealType,
} from '@chefer/utils';
import { invalidateDayQueries } from '../lib/invalidate';
import { handleRebalanceOutcome, REBALANCE_PREVIEW } from '../lib/rebalance-storage';

// Web counterpart of mobile's meal-actions-sheet.tsx (lane A2): save one meal
// of the day under a name, or copy it to another day and/or meal with an
// Undo; the saved meals are listed with a delete.

const label = (meal: string) => meal.charAt(0).toUpperCase() + meal.slice(1);

const chip = (selected: boolean) =>
  `min-h-11 rounded-full border px-3 text-xs font-medium ${selected ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`;

export interface MealActionsSheetProps {
  open: boolean;
  onClose: () => void;
  date: string;
  loggedMealTypes: readonly string[];
  onToast: (message: string, action?: { label: string; onClick: () => void }) => void;
}

export function MealActionsSheet({
  open,
  onClose,
  date,
  loggedMealTypes,
  onToast,
}: MealActionsSheetProps) {
  const utils = trpc.useUtils();
  const days = useMemo(() => copyMealTargetDays(new Date()), []);
  const [mealType, setMealType] = useState<QuickAddMealType>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  const [toMealType, setToMealType] = useState<QuickAddMealType>(mealType);
  const [toDate, setToDate] = useState(days[0]?.date ?? date);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const start =
      QUICK_ADD_MEAL_TYPES.find((t) => loggedMealTypes.includes(t)) ??
      defaultMealSlot(new Date().getHours());
    setMealType(start);
    setToMealType(start);
    setToDate(days.find((d) => d.date !== date)?.date ?? date);
    setName('');
    setNameError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [open]);

  const savedQuery = trpc.savedMeals.list.useQuery(undefined, { enabled: open });
  const createMutation = trpc.savedMeals.createFromDay.useMutation({ meta: { silent: true } });
  const deleteMutation = trpc.savedMeals.delete.useMutation({ meta: { silent: true } });
  const copyMutation = trpc.tracker.copyMeal.useMutation({ meta: { silent: true } });
  const undoMutation = trpc.tracker.deleteEntries.useMutation({
    meta: { silent: true },
    onSuccess: () => invalidateDayQueries(utils),
  });

  const count = loggedMealTypes.filter((t) => t === mealType).length;
  const sameTarget = toDate === date && toMealType === mealType;

  const save = () => {
    const parsed = savedMealNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Give the meal a name.');
      return;
    }
    createMutation.mutate(
      { name: parsed.data, date, mealType },
      {
        onSuccess: (saved) => {
          capture('saved_meal_created', { itemCount: saved.items.length });
          void utils.savedMeals.list.invalidate();
          setName('');
          onToast(`Saved “${saved.name}”`);
        },
      },
    );
  };

  const copy = () => {
    copyMutation.mutate(
      { fromDate: date, fromMealType: mealType, toDate, toMealType, ...REBALANCE_PREVIEW },
      {
        onSuccess: (result) => {
          handleRebalanceOutcome(result);
          invalidateDayQueries(utils);
          const ids = result.copiedEntryIds;
          capture('meal_copied', { itemCount: ids.length, sameDay: toDate === date });
          const dayLabel = days.find((d) => d.date === toDate)?.label ?? toDate;
          onClose();
          onToast(
            copyMealMessage(ids.length, label(toMealType), dayLabel),
            ids.length > 0
              ? {
                  label: 'Undo',
                  onClick: () => undoMutation.mutate({ date: toDate, entryIds: ids }),
                }
              : undefined,
          );
        },
      },
    );
  };

  const saved = savedQuery.data ?? [];

  return (
    <Sheet open={open} onClose={onClose} title={SAVED_MEALS_COPY.actionsTitle} size="sm">
      <div data-testid="meal-actions" className="space-y-4 px-5 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal to save or copy">
            {QUICK_ADD_MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`meal-actions-meal-${t}`}
                aria-pressed={mealType === t}
                onClick={() => {
                  setMealType(t);
                  setToMealType(t);
                }}
                className={chip(mealType === t)}
              >
                {label(t)}
              </button>
            ))}
          </div>
          <p data-testid="meal-actions-count" className="text-xs text-neutral-500">
            {count === 0
              ? SAVED_MEALS_COPY.nothingLogged
              : `${count} ${count === 1 ? 'entry' : 'entries'} logged`}
          </p>
        </div>

        <form
          className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label
            htmlFor="meal-actions-name"
            className="block text-sm font-semibold text-neutral-900"
          >
            {SAVED_MEALS_COPY.saveAs}
          </label>
          <input
            id="meal-actions-name"
            type="text"
            data-testid="meal-actions-name"
            value={name}
            maxLength={SAVED_MEAL_LIMITS.nameMaxLength}
            placeholder="e.g. Weekday breakfast"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={
              nameError || createMutation.error ? 'meal-actions-save-error' : undefined
            }
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              createMutation.reset();
            }}
            className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
          />
          {(nameError ?? createMutation.error) && (
            <p id="meal-actions-save-error" role="alert" className="text-sm text-red-600">
              {nameError ?? userFacingErrorMessage(createMutation.error)}
            </p>
          )}
          <button
            type="submit"
            data-testid="meal-actions-save"
            disabled={count === 0 || createMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving…' : 'Save meal'}
          </button>
        </form>

        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-sm font-semibold text-neutral-900">{SAVED_MEALS_COPY.copyTo}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day to copy to">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                data-testid={`meal-actions-day-${d.date}`}
                aria-pressed={toDate === d.date}
                onClick={() => setToDate(d.date)}
                className={chip(toDate === d.date)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal to copy to">
            {QUICK_ADD_MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`meal-actions-to-meal-${t}`}
                aria-pressed={toMealType === t}
                onClick={() => setToMealType(t)}
                className={chip(toMealType === t)}
              >
                {label(t)}
              </button>
            ))}
          </div>
          {sameTarget && count > 0 && (
            <p className="text-xs text-neutral-500">{SAVED_MEALS_COPY.sameTarget}</p>
          )}
          {copyMutation.isError && (
            <p role="alert" className="text-sm text-red-600">
              {userFacingErrorMessage(copyMutation.error)}
            </p>
          )}
          <button
            type="button"
            data-testid="meal-actions-copy"
            disabled={count === 0 || sameTarget || copyMutation.isPending}
            onClick={copy}
            className="min-h-11 w-full rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-[#944a00] hover:bg-neutral-50 disabled:opacity-50"
          >
            {copyMutation.isPending ? 'Copying…' : 'Copy meal'}
          </button>
        </div>

        {saved.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Your saved meals
            </p>
            {saved.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{meal.name}</p>
                  <p className="text-xs text-neutral-500">{savedMealSummary(meal.items, false)}</p>
                </div>
                <button
                  type="button"
                  data-testid={`meal-actions-delete-${meal.id}`}
                  aria-label={`Delete saved meal ${meal.name}`}
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate(
                      { id: meal.id },
                      { onSuccess: () => void utils.savedMeals.list.invalidate() },
                    )
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
