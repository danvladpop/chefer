'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { handleRebalanceResult } from '@/features/tracker/lib/rebalance-storage';
import { capture } from '@/lib/analytics';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { ArrowRight, Check, ChefHat, Clock, Flame } from 'lucide-react';
import { cn, formatPortion, localDateStr, slotPortion } from '@chefer/utils';

// ─── Today: next meal with one-tap "I ate this" (P2-2, F-PM-7 / F-PM-10) ─────
// Logging a planned meal used to take Home → More → Tracker → ✓ → Save. The
// spotlight now logs it in one tap through tracker.logRecipe (atomic and
// idempotent — a double tap can't double-log), and the summary refetch moves
// the spotlight on to the next meal still to eat.

type HeroMeal = NonNullable<RouterOutputs['dashboard']['summary']['nextMeal']>;

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

interface NextMealCardProps {
  meal: HeroMeal;
  /** Tomorrow's first meal (nothing left today): view only, no logging. */
  isTomorrow: boolean;
}

export function NextMealCard({ meal, isTomorrow }: NextMealCardProps) {
  const utils = trpc.useUtils();
  const [lastLogged, setLastLogged] = useState<string | null>(null);

  const logMutation = trpc.tracker.logRecipe.useMutation({
    onSuccess: (result) => {
      capture('meal_logged', { source: 'today', mealType: meal.mealType });
      // A premium log can rebalance the week — same hand-off as the tracker.
      handleRebalanceResult(result.rebalance);
      setLastLogged(meal.recipe.name);
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
    },
  });

  const totalMins = meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0);
  // P1-1: a plan slot may carry a portion (kcal is already scaled to it); the
  // recipe and cook mode open at that portion, and "I ate this" logs it.
  const portion = meal.portion;
  const recipeHref = `/recipes/${meal.recipe.id}${portion !== undefined ? `?portion=${portion}` : ''}`;
  const cookHref = `/recipes/${meal.recipe.id}/cook?meal=${meal.mealType}${portion !== undefined ? `&portion=${portion}` : ''}`;

  return (
    <div
      data-testid="today-next-meal"
      className="overflow-hidden rounded-2xl border bg-white shadow-sm"
    >
      {/* Stacked on phones — a 128px fixed photo beside text leaves the
          title ~150px and it wraps to four lines. */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <Link
          href={recipeHref}
          className="relative block h-40 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-32"
          aria-label={`Open ${meal.recipe.name}`}
        >
          <Image
            {...getRecipeImageProps(meal.recipe.imageUrl)}
            alt={meal.recipe.name}
            fill
            sizes="(max-width: 639px) 100vw, 128px"
            className="object-cover"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#944a00] px-2.5 py-0.5 text-xs font-semibold uppercase text-white">
                {isTomorrow ? 'Tomorrow' : 'Next meal'}
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase',
                  MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600',
                )}
              >
                {meal.mealType}
              </span>
            </div>
            <h2 className="font-serif text-lg font-bold leading-snug text-gray-900">
              <Link href={recipeHref} className="hover:underline">
                {meal.recipe.name}
              </Link>
            </h2>
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{meal.recipe.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {totalMins} min
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Flame className="h-3.5 w-3.5 text-[#944a00]" aria-hidden="true" />
                {meal.recipe.kcal} kcal
                {portion !== undefined && ` · ${formatPortion(portion)}`}
              </span>
            </div>
          </div>

          {isTomorrow ? (
            <Link
              href={recipeHref}
              className="flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] sm:ml-auto sm:w-auto"
            >
              View recipe <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-testid="today-ate-this"
                onClick={() =>
                  logMutation.mutate({
                    date: localDateStr(),
                    recipeId: meal.recipe.id,
                    mealType: meal.mealType,
                    // The plan slot, so the second of two identical snacks
                    // logs as its own entry.
                    ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
                    // Same clamp as the tracker: logRecipe takes 0.5–2×.
                    portionMultiplier: Math.min(2, Math.max(0.5, slotPortion(portion))),
                  })
                }
                disabled={logMutation.isPending}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {logMutation.isPending ? 'Logging…' : 'I ate this'}
              </button>
              <Link
                href={cookHref}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#944a00]/30 px-4 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8]"
              >
                <ChefHat className="h-4 w-4" aria-hidden="true" />
                Cook it
              </Link>
            </div>
          )}
        </div>
      </div>

      {logMutation.isError && (
        <p role="alert" className="border-t px-4 py-2.5 text-xs text-red-600 sm:px-5">
          Couldn&apos;t log it: {logMutation.error.message}
        </p>
      )}
      {lastLogged && !logMutation.isError && (
        <p
          role="status"
          data-testid="today-logged-status"
          className="flex flex-wrap items-center gap-x-2 border-t bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 sm:px-5"
        >
          <span className="min-w-0">
            Logged <strong>{lastLogged}</strong>.
          </span>
          <Link href="/tracker" className="touch-target relative font-semibold underline">
            Change it in your full day
          </Link>
        </p>
      )}
    </div>
  );
}
