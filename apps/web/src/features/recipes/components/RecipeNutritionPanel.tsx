'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { SourceBadge } from '@/features/ingredients/components/SourceBadge';
import type { RouterOutputs } from '@/lib/trpc';
import { AlertTriangle, Calculator, ChevronDown, PenLine } from 'lucide-react';
import { cn, pressControl } from '@chefer/ui';
import {
  NUTRITION_USER_ENTERED_COPY,
  nutritionComputedCopy,
  nutritionIncompleteCopy,
} from '@chefer/utils';

// ─── Recipe detail nutrition (plan-ingredient-catalog §10) ────────────────────
// The visible proof of the owner's requirement: the numbers are computed from
// the ingredients. "Nutrition is computed from N ingredients" opens the
// per-line breakdown (grams, kcal, protein, source). PARTIAL says how many
// lines need data, with a fix link for the owner; USER_ENTERED says the
// numbers were typed in.

type RecipeDetail = RouterOutputs['mealPlan']['getRecipe'];
type BreakdownLine = NonNullable<RecipeDetail['nutritionLines']>[number];

const fmt1 = (n: number) => String(Math.round(n * 10) / 10);

/**
 * A counted line whose grams are unknown (unmatched, or a unit with no
 * conversion). A line on someone else's private ingredient has grams but no
 * numbers for this viewer (I4); it is not missing data.
 */
const needsData = (l: BreakdownLine): boolean => !l.optional && l.grams == null;

export function RecipeNutritionPanel({
  recipe,
  recipeId,
  canEdit,
}: {
  recipe: RecipeDetail;
  recipeId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const n = recipe.nutritionInfo;
  const lines = recipe.nutritionLines ?? [];
  const status = recipe.nutritionStatus;
  const counted = lines.filter((l) => !l.optional);
  const missing = lines.filter(needsData).length;

  return (
    <section className="mt-8 rounded-2xl border bg-white p-5" aria-labelledby={`${panelId}-title`}>
      <h2 id={`${panelId}-title`} className="mb-3 font-serif text-sm font-semibold text-gray-900">
        Nutrition Facts <span className="text-xs font-normal text-gray-500">per serving</span>
      </h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <NutritionRow label="Calories" value={`${n.calories} kcal`} />
        <NutritionRow label="Protein" value={`${n.protein}g`} />
        <NutritionRow label="Carbs" value={`${n.carbs}g`} />
        <NutritionRow label="Fat" value={`${n.fat}g`} />
      </div>

      {status === 'USER_ENTERED' ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
          <PenLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{NUTRITION_USER_ENTERED_COPY}.</span>
          {canEdit && (
            <Link
              href={`/recipes/${recipeId}/edit`}
              className="inline-flex min-h-11 items-center font-semibold text-[#944a00] hover:underline"
            >
              Link the ingredients to compute it
            </Link>
          )}
        </p>
      ) : status === 'PARTIAL' ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="font-medium text-amber-900">
            {lines.length > 0
              ? `${nutritionIncompleteCopy(missing)}.`
              : 'Incomplete — the ingredients aren’t linked to food data yet.'}
          </span>
          {canEdit && (
            <Link
              href={`/recipes/${recipeId}/edit`}
              data-testid="nutrition-fix-link"
              className="inline-flex min-h-11 items-center font-semibold text-[#944a00] hover:underline"
            >
              Fix in the editor
            </Link>
          )}
        </p>
      ) : null}

      {lines.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(
              'flex min-h-11 items-center gap-1.5 text-left text-xs font-medium text-gray-700 hover:text-[#944a00]',
              pressControl,
            )}
          >
            <Calculator className="h-3.5 w-3.5 shrink-0 text-green-700" aria-hidden="true" />
            <span className="min-w-0">
              {status === 'COMPUTED'
                ? nutritionComputedCopy(counted.length)
                : `See the ${lines.length} ingredient${lines.length === 1 ? '' : 's'}`}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-fast ease-standard',
                open && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
          {open && (
            <div id={panelId} className="mt-2 animate-in fade-in-0 duration-fast">
              <p className="mb-2 text-xs text-gray-600">
                {`The recipe as written (${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}), computed from standard food data.`}
              </p>
              <ul className="divide-y rounded-xl border" aria-label="Nutrition per ingredient">
                {lines.map((l) => (
                  <BreakdownRow key={l.position} line={l} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BreakdownRow({ line }: { line: BreakdownLine }) {
  const name = line.ingredientName ?? line.rawName;
  const amount = `${fmt1(line.quantity)} ${line.unit}`.trim();
  return (
    <li className="flex min-w-0 items-start gap-2 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-gray-900">{name}</p>
        <p className="text-gray-500">
          {amount}
          {line.grams != null && line.unit !== 'g' ? ` · ${fmt1(line.grams)} g` : ''}
          {line.optional ? ' · optional, not counted' : ''}
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {line.facts ? (
          <>
            <p className="font-semibold text-gray-900">{line.facts.calories} kcal</p>
            <p className="text-gray-500">{fmt1(line.facts.protein)} g protein</p>
          </>
        ) : line.grams != null && line.ingredientId == null ? (
          <p className="text-gray-500">Private ingredient</p>
        ) : (
          <p className="font-medium text-amber-800">Needs data</p>
        )}
      </div>
      {line.nutritionSource ? (
        <SourceBadge source={line.nutritionSource} className="mt-0.5" />
      ) : null}
    </li>
  );
}

function NutritionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}
