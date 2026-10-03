'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { StarRatingWidget } from '@/features/recipe/components/StarRatingWidget';
import { CheckedForChip } from '@/features/safety/components/CheckedForChip';
import { handleRebalanceResult } from '@/features/tracker/lib/rebalance-storage';
import { trackMealLogged } from '@/lib/analytics-events';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Check, ChefHat, Repeat } from 'lucide-react';
import { localDateStr, slotPortion, userFacingErrorMessage, verifiedLabels } from '@chefer/utils';

// ─── Tonight card (UX-04 §3, T-04.7) ────────────────────────────────────────────
// Web parity of mobile's tonight-card.tsx — today's DINNER slot specifically,
// Cook it / Swap, done collapses to a compact row with Rate it.
// kcal and "I ate this" only for goal/tracking users (showNutrition, B-31).

type Tonight = NonNullable<RouterOutputs['dashboard']['summary']['tonight']>;

/** 0 = Monday … 6 = Sunday, the Plan page's `day` index. */
function todayPlanDay(now: Date = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function TonightCard({
  meal,
  showNutrition,
  onLogged,
  onSwap,
}: {
  meal: Tonight;
  showNutrition: boolean;
  onLogged: () => void;
  /**
   * T-04.7 delta: opens the existing ReplaceMealSheet inline (L-SAFE2's,
   * apps/web/src/features/meal-plan/components/ReplaceMealSheet.tsx)
   * instead of navigating to the full Plan. Optional so this card still
   * renders standalone (e.g. in a test) without a picker wired up — falls
   * back to linking to /meal-plan.
   */
  onSwap?: () => void;
}) {
  const utils = trpc.useUtils();
  // UX-FOOD-04: "Rate it" opens the real rating widget inline (the one cook
  // mode and recipe detail use); the link is gone once a rating exists.
  const [rateOpen, setRateOpen] = useState(false);
  const myRating = trpc.recipe.getMyRating.useQuery(
    { recipeId: meal.recipe.id },
    { enabled: meal.done },
  );
  const canRate = !myRating.isLoading && !myRating.data;
  const logMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result, variables) => {
      // UX-PO-02: Tonight ticks the planned dinner.
      trackMealLogged('planned', variables.mealType);
      handleRebalanceResult(result.rebalance);
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      onLogged();
    },
  });

  if (meal.done) {
    return (
      <div
        data-testid="tonight-card-done"
        className="flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
            Dinner done · {meal.recipe.name}
          </p>
          {canRate && !rateOpen && (
            <button
              type="button"
              data-testid="tonight-rate-it"
              onClick={() => setRateOpen(true)}
              className="flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold text-[#944a00] hover:underline"
            >
              Rate it
            </button>
          )}
        </div>
        {rateOpen && (
          <StarRatingWidget
            recipeId={meal.recipe.id}
            initialRating={myRating.data?.rating}
            initialNotes={myRating.data?.notes}
          />
        )}
      </div>
    );
  }

  const logPortion = Math.min(2, Math.max(0.5, slotPortion(undefined)));

  return (
    <div
      data-testid="tonight-card"
      className="overflow-hidden rounded-2xl border bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <Link
          href={`/recipes/${meal.recipe.id}`}
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
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#944a00] px-2.5 py-0.5 text-xs font-semibold uppercase text-white">
                Tonight · Dinner
              </span>
              {verifiedLabels(meal.safetyChecks).length > 0 && (
                <CheckedForChip labels={verifiedLabels(meal.safetyChecks)} />
              )}
            </div>
            <h2 className="font-serif text-lg font-bold leading-snug text-gray-900">
              <Link href={`/recipes/${meal.recipe.id}`} className="hover:underline">
                {meal.recipe.name}
              </Link>
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0)} min · for{' '}
              {meal.recipe.servings}
              {showNutrition ? ` · ${meal.recipe.kcal} kcal` : ''}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link
              href={`/recipes/${meal.recipe.id}/cook?meal=${meal.mealType}`}
              data-testid="tonight-cook-it"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00]"
            >
              <ChefHat className="h-4 w-4" aria-hidden="true" />
              Cook it
            </Link>
            {onSwap ? (
              <button
                type="button"
                data-testid="tonight-swap"
                onClick={onSwap}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#944a00]/30 px-4 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8]"
              >
                <Repeat className="h-4 w-4" aria-hidden="true" />
                Swap
              </button>
            ) : (
              <Link
                // UX-FOOD-18: Plan opens on NEXT week on Friday/Saturday evenings;
                // name this week and today's weekday so Swap lands on tonight.
                href={`/meal-plan?week=0&day=${todayPlanDay()}`}
                data-testid="tonight-swap"
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#944a00]/30 px-4 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8]"
              >
                <Repeat className="h-4 w-4" aria-hidden="true" />
                Swap
              </Link>
            )}
          </div>
        </div>
      </div>
      {showNutrition && (
        <button
          type="button"
          data-testid="tonight-ate-this"
          onClick={() =>
            logMutation.mutate({
              date: localDateStr(),
              recipeId: meal.recipe.id,
              mealType: meal.mealType,
              slotIndex: meal.slotIndex,
              portionMultiplier: logPortion,
            })
          }
          disabled={logMutation.isPending}
          className="flex min-h-11 w-full items-center justify-center border-t text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8] disabled:opacity-60"
        >
          {logMutation.isPending ? 'Logging…' : 'I ate this'}
        </button>
      )}
      {logMutation.isError && (
        <p role="alert" className="border-t px-4 py-2.5 text-xs text-red-600 sm:px-5">
          Couldn&apos;t log it: {userFacingErrorMessage(logMutation.error)}
        </p>
      )}
    </div>
  );
}

export function NothingTonightCard() {
  return (
    <div
      data-testid="nothing-tonight-card"
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-white py-8 text-center shadow-sm"
    >
      <p className="font-medium text-gray-700">Nothing planned tonight</p>
      <p className="text-sm text-gray-500">Pick something quick from your recipes</p>
      <Link
        href="/recipes"
        data-testid="nothing-tonight-find-recipe"
        className="text-sm font-semibold text-[#944a00] hover:underline"
      >
        Find a recipe
      </Link>
    </div>
  );
}
