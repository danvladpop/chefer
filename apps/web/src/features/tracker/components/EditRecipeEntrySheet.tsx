'use client';

import { useEffect, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
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
const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

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
  const { proteinOnly } = useNumbersMode(); // WP-08
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
      title="Edit meal"
      size="sm"
      footer={
        <div className="w-full space-y-2 px-5 pb-2">
          <button
            type="button"
            data-testid="edit-recipe-entry-save"
            onClick={() => onSave({ portionMultiplier: portion, mealType })}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00]"
          >
            Save
          </button>
          <button
            type="button"
            data-testid="edit-recipe-entry-delete"
            onClick={onDelete}
            className="min-h-11 w-full rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 pb-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800">{entry.recipeName}</p>
          <p className="text-xs text-neutral-500">
            {proteinOnly
              ? entry.protein === undefined
                ? 'Logged'
                : `Logged as ${proteinLabel(entry.protein)}`
              : `Logged as ${Math.round(entry.kcal)} kcal`}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">Portion</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Portion">
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
          <p className="text-xs font-medium text-neutral-600">Meal</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
            {MEAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`edit-recipe-entry-meal-${o.value}`}
                aria-pressed={mealType === o.value}
                onClick={() => setMealType(o.value)}
                className={`min-h-11 rounded-lg px-3 text-xs font-medium ${mealType === o.value ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
