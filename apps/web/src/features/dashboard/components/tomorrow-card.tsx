'use client';

import Image from 'next/image';
import Link from 'next/link';
import { getRecipeImageProps } from '@/lib/recipe-image';
import type { RouterOutputs } from '@/lib/trpc';
import { ArrowRight } from 'lucide-react';
import { cn } from '@chefer/utils';

// ─── Tomorrow card (UX-04 §2/§3, T-04.7) ────────────────────────────────────────
// The 21:30–03:59 band, or once tonight's dinner is done — "TOMORROW ·
// {MEAL}", never "Next meal" after 21:30. Read-only preview, same as
// NextMealCard's isTomorrow branch.

type Tomorrow = NonNullable<RouterOutputs['dashboard']['summary']['tomorrow']>;

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

export function TomorrowCard({ meal }: { meal: Tomorrow }) {
  return (
    <div
      data-testid="tomorrow-card"
      className="overflow-hidden rounded-2xl border bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <Link
          href={`/recipes/${meal.recipe.id}`}
          className="relative block h-32 w-full shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-28"
          aria-label={`Open ${meal.recipe.name}`}
        >
          <Image
            {...getRecipeImageProps(meal.recipe.imageUrl)}
            alt={meal.recipe.name}
            fill
            sizes="(max-width: 639px) 100vw, 112px"
            className="object-cover"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#944a00] px-2.5 py-0.5 text-xs font-semibold uppercase text-white">
                Tomorrow
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
            <h2 className="font-serif text-base font-bold leading-snug text-gray-900">
              {meal.recipe.name}
            </h2>
          </div>
          <Link
            href={`/recipes/${meal.recipe.id}`}
            data-testid="tomorrow-view-recipe"
            className="flex min-h-11 w-full items-center justify-center gap-1 rounded-full border border-[#944a00]/30 px-4 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8] sm:ml-auto sm:w-auto"
          >
            View recipe <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
