'use client';

import { useEffect, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { Sheet } from '@chefer/ui';
import {
  formatPortion,
  proteinLabel,
  QUICK_ADD_MEAL_TYPES,
  type QuickAddMealType,
} from '@chefer/utils';

// Edit or remove a logged recipe that is no longer on the day's plan — the
// "Also eaten" rows (UX-FOOD-03). A mis-log or a stale one used to be
// read-only, its calories stuck on the day for good. Portion and meal are
// editable; the server recomputes the macros from the recipe. Delete lives in
// the footer and the tracker offers Undo. Web twin of
// apps/mobile/src/features/tracker/edit-recipe-entry-sheet.tsx.

const PORTIONS = [0.5, 1, 1.5, 2];
const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((v) => ({ value: v }));

export interface EditRecipeEntrySheetProps {
  open: boolean;
  onClose: () => void;
  entry: {
    entryId?: string | undefined;
    recipeName: string;
    mealType: string;
    kcal: number;
    protein?: number | undefined;
    portionMultiplier?: number | undefined;
  } | null;
  onSave: (edit: { portionMultiplier: number; mealType: string }) => void;
  onDelete: () => void;
}

export function EditRecipeEntrySheet({
  open,
  onClose,
  entry,
  onSave,
  onDelete,
}: EditRecipeEntrySheetProps) {
  const { t } = useT();
  const { proteinOnly, noNumbers } = useNumbersMode(); // WP-08, lane E3
  const [portion, setPortion] = useState(1);
  const [mealType, setMealType] = useState<QuickAddMealType>('dinner');

  useEffect(() => {
    if (!entry) return;
    setPortion(entry.portionMultiplier ?? 1);
    setMealType(
      (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(entry.mealType)
        ? (entry.mealType as QuickAddMealType)
        : 'dinner',
    );
  }, [entry]);

  if (!entry) return null;

  // A portion the picker doesn't list (the plan's 1¼×) stays selectable.
  const portions = [...new Set([...PORTIONS, portion])].sort((a, b) => a - b);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('tracker.editEntry.title')}
      size="sm"
      footer={
        <div className="w-full space-y-2 px-5 pb-2">
          <button
            type="button"
            data-testid="edit-recipe-entry-save"
            onClick={() => onSave({ portionMultiplier: portion, mealType })}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00]"
          >
            {t('common.actions.save')}
          </button>
          <button
            type="button"
            data-testid="edit-recipe-entry-delete"
            onClick={onDelete}
            className="min-h-11 w-full rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            {t('common.actions.delete')}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 pb-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800">{entry.recipeName}</p>
          <p className="text-xs text-neutral-500">
            {noNumbers
              ? t('tracker.editEntry.logged')
              : proteinOnly
                ? entry.protein === undefined
                  ? t('tracker.editEntry.logged')
                  : t('tracker.editEntry.loggedAsProtein', { protein: proteinLabel(entry.protein) })
                : t('tracker.editEntry.loggedAsKcal', { kcal: Math.round(entry.kcal) })}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">{t('tracker.editEntry.portion')}</p>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('tracker.editEntry.portion')}
          >
            {portions.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`edit-recipe-entry-portion-${p}`}
                aria-pressed={portion === p}
                onClick={() => setPortion(p)}
                className={`min-h-11 rounded-lg px-3 text-xs font-medium ${portion === p ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >
                {formatPortion(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">{t('tracker.editEntry.meal')}</p>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('tracker.editEntry.meal')}
          >
            {MEAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`edit-recipe-entry-meal-${o.value}`}
                aria-pressed={mealType === o.value}
                onClick={() => setMealType(o.value)}
                className={`min-h-11 rounded-lg px-3 text-xs font-medium ${mealType === o.value ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >
                {t(`tracker.meals.${o.value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
