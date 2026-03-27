'use client';

import Image from 'next/image';
import Link from 'next/link';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { ArrowRight, ChevronRight, Clock, Flame } from 'lucide-react';

// ─── Meal type colours ─────────────────────────────────────────────────────────

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = trpc.dashboard.summary.useQuery();

  if (isLoading) return <DashboardSkeleton />;

  const d = data;
  if (!d) return null;

  const hasPlan = d.weekPlan.length > 0;

  // Day‑of‑week labels Mon–Sun
  const today = new Date();
  const jsDay = today.getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - todayIdx + i);
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      num: date.getDate(),
      idx: i,
      hasMeals: d.weekPlan.some((wp) => wp.dayOfWeek === i && wp.meals.length > 0),
    };
  });

  // Macro bar width helper (capped at 100%)
  const pct = (v: number, t: number) => Math.min(Math.round((v / (t || 1)) * 100), 100);
  const n = d.nutrition;
  const calPct = pct(n.plannedKcal, n.dailyCalorieTarget);
  const isOverTarget = n.plannedKcal > n.dailyCalorieTarget;
  const remaining = Math.max(n.dailyCalorieTarget - n.plannedKcal, 0);

  // SVG ring
  const R = 52;
  const CIRCUM = 2 * Math.PI * R;
  const ringFill = CIRCUM - (CIRCUM * calPct) / 100;

  return (
    <div className="flex h-full gap-6 p-6">
      {/* ── Left column ─────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {/* Header */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Welcome Back, Chef
          </p>
          <div className="mt-0.5 flex items-center justify-between">
            <h1 className="font-serif text-2xl font-bold text-gray-900">Your Daily Overview</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{d.today.date}</span>
              {hasPlan && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Sustainable Choice
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Weekly Outlook card */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Weekly Outlook
            </p>
            <Link href="/meal-plan" className="text-xs font-medium text-[#944a00] hover:underline">
              Full Schedule →
            </Link>
          </div>
          <div className="flex gap-2">
            {days.map((day) => (
              <div
                key={day.idx}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 ${
                  day.idx === todayIdx ? 'bg-[#944a00] text-white' : 'bg-gray-50 text-gray-600'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase">{day.label}</span>
                <span className="text-sm font-bold">{day.num}</span>
                {day.hasMeals && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${day.idx === todayIdx ? 'bg-white/70' : 'bg-[#944a00]'}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Next Meal spotlight */}
        {d.nextMeal ? (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex gap-4 p-5">
              {/* Recipe photo */}
              <div className="relative h-28 w-32 shrink-0 overflow-hidden rounded-xl">
                <Image
                  {...getRecipeImageProps(d.nextMeal.recipe.imageUrl)}
                  alt={d.nextMeal.recipe.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-col justify-between">
                <div>
                  <div className="mb-1 flex gap-2">
                    <span className="rounded-full bg-[#944a00] px-2.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Next Meal
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${MEAL_COLOURS[d.nextMeal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {d.nextMeal.mealType}
                    </span>
                  </div>
                  <h2 className="font-serif text-lg font-bold text-gray-900 leading-snug">
                    {d.nextMeal.recipe.name}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                    {d.nextMeal.recipe.description}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {d.nextMeal.recipe.prepTimeMins} min
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Flame className="h-3.5 w-3.5 text-[#944a00]" />
                    {d.nextMeal.recipe.kcal} kcal
                  </span>
                  <Link
                    href={`/recipes/${d.nextMeal.recipe.id}`}
                    className="ml-auto flex items-center gap-1 rounded-full bg-[#944a00] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#7a3d00]"
                  >
                    Start Cooking <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : hasPlan ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-white py-8 text-center shadow-sm">
            <span className="text-3xl">🎉</span>
            <p className="font-medium text-gray-700">You&apos;re all caught up for today!</p>
            <Link href="/meal-plan" className="text-sm text-[#944a00] hover:underline">
              View full plan →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-white py-10 text-center shadow-sm">
            <span className="text-4xl">🥣</span>
            <div>
              <p className="font-semibold text-gray-800">Your weekly menu awaits</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Let AI craft a personalised 7-day plan for you.
              </p>
            </div>
            <Link
              href="/meal-plan"
              className="rounded-full bg-[#944a00] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a3d00]"
            >
              Generate My Week
            </Link>
          </div>
        )}

        {/* Rest of Today */}
        {d.restOfToday.length > 0 && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Rest of Today
            </p>
            <div className="flex flex-col divide-y">
              {d.restOfToday.map((meal, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-xs text-gray-400">{meal.scheduledLabel}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {meal.mealType}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{meal.recipeName}</span>
                  </div>
                  <span className="text-xs text-gray-400">{meal.kcal} kcal</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Favourites */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Recent Favourites
            </p>
            <Link
              href="/recipes?filter=saved"
              className="text-xs font-medium text-[#944a00] hover:underline"
            >
              View All →
            </Link>
          </div>
          {d.recentFavourites.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-1">
              {d.recentFavourites.map((fav) => (
                <Link
                  key={fav.id}
                  href={`/recipes/${fav.id}`}
                  className="flex w-36 shrink-0 flex-col gap-2 rounded-xl border p-1 pb-2 hover:border-[#944a00]/40 hover:shadow-md transition-all"
                >
                  <div className="relative h-24 overflow-hidden rounded-lg">
                    <Image
                      {...getRecipeImageProps(fav.imageUrl)}
                      alt={fav.name}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  </div>
                  <div className="px-1">
                    <p className="truncate text-xs font-semibold text-gray-800">{fav.name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {fav.cuisineType} · {fav.prepTimeMins}m
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Save a recipe to see it here.{' '}
              <Link href="/meal-plan" className="text-[#944a00] hover:underline">
                Go to Meal Planner →
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* ── Right column — Nutrition Panel ──────────────────────────────────── */}
      <div className="hidden w-72 shrink-0 flex-col gap-4 lg:flex">
        <div className="sticky top-6 rounded-2xl border bg-white p-5 shadow-sm">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Planned Today
            </p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                isOverTarget ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isOverTarget ? 'Over Target' : 'On Track'}
            </span>
          </div>

          {/* Calorie ring */}
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="relative">
              <svg
                width="128"
                height="128"
                viewBox="0 0 128 128"
                role="img"
                aria-label="Calorie progress ring"
              >
                <circle cx="64" cy="64" r={R} fill="none" stroke="#f3f4f6" strokeWidth="12" />
                <circle
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke="#944a00"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUM}
                  strokeDashoffset={ringFill}
                  transform="rotate(-90 64 64)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-gray-900">{n.plannedKcal.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400">
                  of {n.dailyCalorieTarget.toLocaleString()} kcal
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-500">
              {remaining.toLocaleString()} remaining
            </p>
          </div>

          {/* Macro bars */}
          <div className="mt-2 flex flex-col gap-3">
            {[
              { label: 'Protein', v: n.protein.planned, t: n.protein.targetG },
              { label: 'Carbs', v: n.carbs.planned, t: n.carbs.targetG },
              { label: 'Fat', v: n.fat.planned, t: n.fat.targetG },
            ].map(({ label, v, t }) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{label}</span>
                  <span className="text-gray-400">
                    {v}g / {t}g
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#944a00] transition-all"
                    style={{ width: `${pct(v, t)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* AI hint */}
          {d.nextMeal && (
            <div className="mt-4 rounded-xl bg-[#fff3e8] px-3 py-2.5">
              <p className="text-xs text-[#944a00]">
                🤖 Your upcoming <strong>{d.nextMeal.recipe.name}</strong> supports your daily
                nutrition goals.
              </p>
            </div>
          )}

          {/* Quick links */}
          <div className="mt-4 flex flex-col gap-1.5">
            <Link
              href="/meal-plan"
              className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
            >
              Meal Planner <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/shopping-list"
              className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
            >
              Shopping List <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex h-full gap-6 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="h-12 w-56 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-36 w-full animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-32 w-full animate-pulse rounded-2xl bg-gray-100" />
      </div>
      <div className="hidden w-72 lg:block">
        <div className="h-96 w-full animate-pulse rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}
