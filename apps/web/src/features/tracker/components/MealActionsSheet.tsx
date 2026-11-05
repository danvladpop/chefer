'use client';

import { useEffect, useMemo, useState } from 'react';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Trash2 } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import { SAVED_MEAL_LIMITS, savedMealNameSchema } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  copyMealTargetDays,
  defaultMealSlot,
  formatNumber,
  QUICK_ADD_MEAL_TYPES,
  savedMealTotals,
  userFacingErrorMessage,
  type QuickAddMealType,
} from '@chefer/utils';
import { invalidateDayQueries } from '../lib/invalidate';
import {
  handleRebalanceOutcome,
  REBALANCE_PREVIEW,
  withDayFitLine,
} from '../lib/rebalance-storage';

// Web counterpart of mobile's meal-actions-sheet.tsx (lane A2): save one meal
// of the day under a name, or copy it to another day and/or meal with an
// Undo; the saved meals are listed with a delete.

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * The copy-to day chips ("Today", "Yesterday", "Mon 3") and the same day as it
 * sits inside the snackbar sentence. `copyMealTargetDays` gives the dates,
 * newest first.
 */
function copyDayLabels(t: Translator['t'], days: { date: string }[]) {
  return days.map(({ date }, index) => {
    const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
    const weekday = t(
      `common.weekdaysShort.${WEEKDAY_KEYS[new Date(y, m - 1, d).getDay()] ?? 'mon'}`,
    );
    const label =
      index === 0
        ? t('tracker.savedMeals.today')
        : index === 1
          ? t('tracker.savedMeals.yesterday')
          : t('tracker.savedMeals.dayLabel', { weekday, day: String(d) });
    const inSentence =
      index === 0
        ? t('tracker.savedMeals.todayInSentence')
        : index === 1
          ? t('tracker.savedMeals.yesterdayInSentence')
          : label;
    return { date, label, inSentence };
  });
}

/** "Copied 3 entries to lunch, yesterday" — the snackbar after a copy. */
function copiedMessage(t: Translator['t'], count: number, meal: QuickAddMealType, day: string) {
  if (count === 0) return t('tracker.savedMeals.nothingToCopy');
  return t('tracker.savedMeals.copied', {
    count,
    meal: t(`tracker.mealInSentence.${meal}`),
    day,
  });
}

/** "3 items · 540 kcal". */
function savedMealSummaryText(t: Translator['t'], items: Parameters<typeof savedMealTotals>[0]) {
  return t('tracker.savedMeals.summaryKcal', {
    count: items.length,
    kcal: formatNumber(savedMealTotals(items).kcal),
  });
}

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
  const { t } = useT();
  const utils = trpc.useUtils();
  const days = useMemo(() => copyDayLabels(t, copyMealTargetDays(new Date())), [t]);
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
      QUICK_ADD_MEAL_TYPES.find((m) => loggedMealTypes.includes(m)) ??
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

  const count = loggedMealTypes.filter((m) => m === mealType).length;
  const sameTarget = toDate === date && toMealType === mealType;

  const save = () => {
    const parsed = savedMealNameSchema.safeParse(name);
    if (!parsed.success) {
      // The input's maxLength caps the length, so the one failure left is an empty name.
      setNameError(t('tracker.savedMeals.nameRequired'));
      return;
    }
    createMutation.mutate(
      { name: parsed.data, date, mealType },
      {
        onSuccess: (saved) => {
          capture('saved_meal_created', { itemCount: saved.items.length });
          void utils.savedMeals.list.invalidate();
          setName('');
          onToast(t('tracker.savedMeals.saved', { name: saved.name }));
        },
      },
    );
  };

  const copy = () => {
    copyMutation.mutate(
      { fromDate: date, fromMealType: mealType, toDate, toMealType, ...REBALANCE_PREVIEW },
      {
        onSuccess: (result) => {
          // Day rebalance: the resize line rides on this toast, not a second one.
          handleRebalanceOutcome(result, { announceDayFit: false });
          invalidateDayQueries(utils);
          const ids = result.copiedEntryIds;
          capture('meal_copied', { itemCount: ids.length, sameDay: toDate === date });
          const dayLabel = days.find((d) => d.date === toDate)?.inSentence ?? toDate;
          onClose();
          onToast(
            withDayFitLine(copiedMessage(t, ids.length, toMealType, dayLabel), result),
            ids.length > 0
              ? {
                  label: t('tracker.undo'),
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
    <Sheet open={open} onClose={onClose} title={t('tracker.savedMeals.actionsTitle')} size="sm">
      <div data-testid="meal-actions" className="space-y-4 px-5 pb-4">
        <div className="space-y-1">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('tracker.savedMeals.mealToSave')}
          >
            {QUICK_ADD_MEAL_TYPES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`meal-actions-meal-${m}`}
                aria-pressed={mealType === m}
                onClick={() => {
                  setMealType(m);
                  setToMealType(m);
                }}
                className={chip(mealType === m)}
              >
                {t(`tracker.meals.${m}`)}
              </button>
            ))}
          </div>
          <p data-testid="meal-actions-count" className="text-xs text-neutral-500">
            {count === 0
              ? t('tracker.savedMeals.nothingLogged')
              : t('tracker.savedMeals.entriesLogged', { count })}
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
            {t('tracker.savedMeals.saveAs')}
          </label>
          <input
            id="meal-actions-name"
            type="text"
            data-testid="meal-actions-name"
            value={name}
            maxLength={SAVED_MEAL_LIMITS.nameMaxLength}
            placeholder={t('tracker.savedMeals.namePlaceholder')}
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
            {createMutation.isPending
              ? t('tracker.savedMeals.saving')
              : t('tracker.savedMeals.save')}
          </button>
        </form>

        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-sm font-semibold text-neutral-900">{t('tracker.savedMeals.copyTo')}</p>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('tracker.savedMeals.dayToCopy')}
          >
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
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('tracker.savedMeals.mealToCopy')}
          >
            {QUICK_ADD_MEAL_TYPES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`meal-actions-to-meal-${m}`}
                aria-pressed={toMealType === m}
                onClick={() => setToMealType(m)}
                className={chip(toMealType === m)}
              >
                {t(`tracker.meals.${m}`)}
              </button>
            ))}
          </div>
          {sameTarget && count > 0 && (
            <p className="text-xs text-neutral-500">{t('tracker.savedMeals.sameTarget')}</p>
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
            {copyMutation.isPending
              ? t('tracker.savedMeals.copying')
              : t('tracker.savedMeals.copy')}
          </button>
        </div>

        {saved.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {t('tracker.savedMeals.yourSaved')}
            </p>
            {saved.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{meal.name}</p>
                  <p className="text-xs text-neutral-500">{savedMealSummaryText(t, meal.items)}</p>
                </div>
                <button
                  type="button"
                  data-testid={`meal-actions-delete-${meal.id}`}
                  aria-label={t('tracker.savedMeals.delete', { name: meal.name })}
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
