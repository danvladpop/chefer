'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import {
  checkMacroSanity,
  formatQuickAddGrams,
  QUICK_ADD_MEAL_TYPES,
  type CustomEntryRow,
  type QuickAddMealType,
} from '@chefer/utils';
import { invalidateDayQueries } from '../lib/invalidate';

// Edit any custom entry, undo any delete (bug B-34, T-19.2). Only custom
// entries (quick-adds, photo scans) reach this sheet — a planned-recipe row
// is "edited" by re-ticking it with a different portion.

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));
const MACROS = ['protein', 'carbs', 'fat'] as const;
type MacroKey = (typeof MACROS)[number];

interface CustomEntrySnapshot {
  entryId: string;
  custom: { name: string; estimatedBy: 'vision' | 'manual' };
  mealType: string;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

type DayData = RouterOutputs['tracker']['getDay'];

/** Splices `entryIndex` out of the cached day (AC2 "Delete — immediate"). */
function withEntryRemoved(day: DayData, entryIndex: number): DayData {
  if (!day.log) return day;
  return {
    ...day,
    log: { ...day.log, loggedMeals: day.log.loggedMeals.filter((_, i) => i !== entryIndex) },
  };
}

/** Reinserts a deleted entry at its original slot (Undo, exactly). */
function withEntryRestored(day: DayData, entryIndex: number, entry: CustomEntrySnapshot): DayData {
  if (!day.log) return day;
  const loggedMeals = [...day.log.loggedMeals];
  loggedMeals.splice(entryIndex, 0, entry);
  return { ...day, log: { ...day.log, loggedMeals } };
}

export interface EditEntrySheetProps {
  open: boolean;
  onClose: () => void;
  /** YYYY-MM-DD day the entry belongs to. */
  date: string;
  entry: CustomEntryRow | null;
  onSaved: () => void;
  onDeleted: () => void;
  showToast: (message: string, action?: { label: string; onClick: () => void }) => void;
}

export function EditEntrySheet({
  open,
  onClose,
  date,
  entry,
  onSaved,
  onDeleted,
  showToast,
}: EditEntrySheetProps) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<QuickAddMealType>('snack');
  const [kcal, setKcal] = useState('');
  const [macros, setMacros] = useState<Record<MacroKey, string>>({
    protein: '',
    carbs: '',
    fat: '',
  });
  const [sanityOverridden, setSanityOverridden] = useState(false);
  const kcalRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setMealType(
      (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(entry.mealType)
        ? (entry.mealType as QuickAddMealType)
        : 'snack',
    );
    setKcal(String(entry.kcal));
    setMacros({
      protein: formatQuickAddGrams(entry.protein),
      carbs: formatQuickAddGrams(entry.carbs),
      fat: formatQuickAddGrams(entry.fat),
    });
    setSanityOverridden(false);
  }, [entry]);

  const updateMutation = trpc.tracker.updateCustomMeal.useMutation({
    onSuccess: () => {
      invalidateDayQueries(utils, date);
      showToast('Changes saved');
      onSaved();
      onClose();
    },
  });
  const deleteMutation = trpc.tracker.deleteCustomMeal.useMutation();
  const restoreMutation = trpc.tracker.restoreCustomMeal.useMutation({
    onSuccess: () => invalidateDayQueries(utils, date),
  });

  if (!entry) return null;
  const entryId = entry.entryId;

  const kcalNumber = Math.max(0, Math.round(Number(kcal.replace(',', '.')) || 0));
  const macroNumbers = {
    protein: Math.max(0, Number(macros.protein.replace(',', '.')) || 0),
    carbs: Math.max(0, Number(macros.carbs.replace(',', '.')) || 0),
    fat: Math.max(0, Number(macros.fat.replace(',', '.')) || 0),
  };
  const sanity = sanityOverridden ? null : checkMacroSanity({ kcal: kcalNumber, ...macroNumbers });
  const canSave =
    !!entryId && name.trim().length > 0 && kcalNumber > 0 && !updateMutation.isPending;

  const save = () => {
    if (!canSave || !entryId || sanity?.message) return;
    updateMutation.mutate({
      date,
      entryId,
      name: name.trim(),
      estimatedBy: entry.estimatedBy,
      mealType,
      kcal: kcalNumber,
      protein: macroNumbers.protein,
      carbs: macroNumbers.carbs,
      fat: macroNumbers.fat,
    });
  };

  const del = () => {
    if (deleteMutation.isPending || !entryId) return;
    const entryIndex = entry.entryIndex;
    const snapshot: CustomEntrySnapshot = {
      entryId,
      custom: { name: entry.name, estimatedBy: entry.estimatedBy },
      mealType: entry.mealType,
      portionMultiplier: 1,
      kcal: entry.kcal,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    };
    onClose();

    // Bug B-34/AC2 ("Delete — immediate"): splice the row out of the cached
    // day right away instead of waiting on the network round trip + refetch
    // — under load that round trip can take several seconds, which used to
    // eat into the Undo toast's own window before the row had even
    // disappeared. deleteMutation reconciles with the server in the
    // background; onError rolls this back with a real refetch.
    utils.tracker.getDay.setData({ date }, (old) =>
      old ? withEntryRemoved(old, entryIndex) : old,
    );

    deleteMutation.mutate(
      { date, entryIndex },
      {
        onSuccess: () => {
          invalidateDayQueries(utils, date);
          onDeleted();
          showToast(`Deleted ${entry.name}`, {
            label: 'Undo',
            onClick: () => {
              // Undo must be exactly as immediate as the delete it reverses.
              utils.tracker.getDay.setData({ date }, (old) =>
                old ? withEntryRestored(old, entryIndex, snapshot) : old,
              );
              restoreMutation.mutate(
                { date, entry: snapshot },
                { onError: () => void utils.tracker.getDay.invalidate({ date }) },
              );
            },
          });
        },
        onError: () => void utils.tracker.getDay.invalidate({ date }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit entry"
      size="sm"
      footer={
        <div className="w-full space-y-2 px-5 pb-2">
          {sanity?.message && (
            <div
              data-testid="edit-entry-sanity"
              className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
            >
              <p>{sanity.message}</p>
              <button
                type="button"
                data-testid="edit-entry-sanity-fix"
                onClick={() => kcalRef.current?.focus()}
                className="min-h-11 rounded-lg border border-amber-300 px-3 text-xs font-semibold"
              >
                Fix
              </button>
              <button
                type="button"
                data-testid="edit-entry-sanity-log-anyway"
                onClick={() => setSanityOverridden(true)}
                className="min-h-11 rounded-lg border border-amber-300 px-3 text-xs font-semibold"
              >
                Log anyway
              </button>
            </div>
          )}
          <button
            type="button"
            data-testid="edit-entry-save"
            onClick={save}
            disabled={!canSave || !!sanity?.message}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            data-testid="edit-entry-delete"
            onClick={del}
            className="min-h-11 w-full rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 pb-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          What did you eat?
          <input
            type="text"
            data-testid="edit-entry-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
          />
        </label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
          {MEAL_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              data-testid={`edit-entry-meal-${o.value}`}
              onClick={() => setMealType(o.value)}
              className={`min-h-11 rounded-full border px-3 text-xs font-medium ${mealType === o.value ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Calories
          <span className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              data-testid="edit-entry-kcal"
              ref={kcalRef}
              value={kcal}
              onChange={(e) => {
                setKcal(e.target.value);
                setSanityOverridden(false);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
            />
            <span className="shrink-0 text-neutral-400">kcal</span>
          </span>
        </label>

        <div className="flex gap-2">
          {MACROS.map((k) => (
            <label
              key={k}
              className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-neutral-600"
            >
              {k.charAt(0).toUpperCase() + k.slice(1)}
              <input
                type="number"
                inputMode="decimal"
                data-testid={`edit-entry-${k}`}
                value={macros[k]}
                onChange={(e) => {
                  setMacros((prev) => ({ ...prev, [k]: e.target.value }));
                  setSanityOverridden(false);
                }}
                className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
              />
            </label>
          ))}
        </div>

        {updateMutation.isError && (
          <p data-testid="edit-entry-api-error" className="text-xs text-red-600">
            {updateMutation.error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
