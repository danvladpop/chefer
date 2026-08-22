'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { NutritionSummary } from '@/features/dashboard/components/nutrition-summary';
import { useIsPremium } from '@/hooks/useIsPremium';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Clock, Flame, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

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
  const { data: weekSummary } = trpc.tracker.weeklySummary.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Profile completion nudge: surface it here rather than letting the user
  // discover the gap only when "Generate plan" asks for a profile.
  const isPremium = useIsPremium();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: isPremium === true,
    staleTime: 60_000,
  });
  const showProfileNudge = isPremium === true && hasProfile === false;

  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

  if (isLoading) return <DashboardSkeleton />;

  const d = data;
  if (!d) return null;

  const hasPlan = d.weekPlan.length > 0;

  // After the last meal window of the day the API sends tomorrow's first meal
  // instead — the spotlight stays populated, just badged "Tomorrow".
  const heroMeal = d.nextMeal ?? d.tomorrowFirstMeal;
  const heroIsTomorrow = !d.nextMeal && d.tomorrowFirstMeal !== null;

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

  return (
    // Single column on phones; the nutrition rail only splits off at xl, where
    // there is room for sidebar + content + 288px rail.
    <div className="flex flex-col gap-4 p-4 xl:flex-row xl:gap-6 xl:p-6">
      {/* ── Main column ─────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-6">
        {/* PW-5: the Sunday worker (or planning ahead) left this week ready */}
        {d.weekReady && d.today.dayOfWeek === 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Your week is ready</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                The chef prepared this week&apos;s plan for you on Sunday
                {d.weekReady.ratedCount > 0 && (
                  <>
                    {' '}
                    — built from <strong>{d.weekReady.ratedCount}</strong> dish
                    {d.weekReady.ratedCount === 1 ? '' : 'es'} you rated
                  </>
                )}
                .
              </p>
            </div>
          </div>
        )}

        {showProfileNudge && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#944a00]/20 bg-[#fff3e8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#944a00]">Complete your profile</p>
              <p className="mt-0.5 text-xs text-[#944a00]/80">
                Tell the AI chef your goals, body metrics and dietary needs so your meal plans are
                built for you.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] sm:min-h-0 sm:py-2"
            >
              Set up now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Header */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Welcome Back, Chef
          </p>
          <div className="mt-0.5 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h1 className="font-serif text-xl font-bold text-gray-900 sm:text-2xl">
              Your Daily Overview
            </h1>
            <div className="flex flex-wrap items-center gap-2">
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
        <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Weekly Outlook
            </p>
            <Link
              href="/meal-plan"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-[#944a00] hover:underline"
            >
              Full Schedule →
            </Link>
          </div>
          {/* Seven equal chips would be ~41px wide at 375px — under the touch
              minimum. Below sm they become fixed-width snap chips that scroll;
              from sm up there is room to divide the row evenly. */}
          <div className="scroll-rail -mx-1 gap-1.5 px-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:gap-2 sm:overflow-visible sm:px-0">
            {days.map((day) => {
              const isToday = day.idx === todayIdx;
              const isSelected = selectedDayIdx === day.idx;
              return (
                <button
                  key={day.idx}
                  type="button"
                  onClick={() => setSelectedDayIdx(isSelected ? null : day.idx)}
                  aria-pressed={isSelected}
                  className={`flex w-[52px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl py-3 transition-all sm:w-auto ${
                    isToday
                      ? 'bg-[#944a00] text-white'
                      : isSelected
                        ? 'bg-[#944a00]/15 text-[#944a00] ring-1 ring-[#944a00]/40'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase">{day.label}</span>
                  <span className="text-sm font-bold">{day.num}</span>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      !day.hasMeals ? 'bg-transparent' : isToday ? 'bg-white/70' : 'bg-[#944a00]'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Day meals panel */}
          {selectedDayIdx !== null &&
            (() => {
              const dayData = days[selectedDayIdx];
              const dayPlan = d.weekPlan.find((wp) => wp.dayOfWeek === selectedDayIdx);
              const dayMeals = dayPlan?.meals ?? [];
              const isToday = selectedDayIdx === todayIdx;
              const isPast = selectedDayIdx < todayIdx;
              return (
                <div className="mt-4 border-t pt-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                    {isToday
                      ? "Today's Meals"
                      : isPast
                        ? `${dayData?.label} ${dayData?.num} — Past`
                        : `${dayData?.label} ${dayData?.num} — Upcoming`}
                  </p>
                  {dayMeals.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                      <UtensilsCrossed className="h-4 w-4" />
                      No meals planned for this day.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dayMeals.map((meal) => (
                        <Link
                          key={`${meal.mealType}-${meal.recipeId}`}
                          href={`/recipes/${meal.recipeId}`}
                          className="flex items-center gap-3 rounded-xl border bg-gray-50 p-2.5 transition-all hover:border-[#944a00]/30 hover:bg-white hover:shadow-sm"
                        >
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                            <Image
                              {...getRecipeImageProps(meal.imageUrl)}
                              alt={meal.recipeName}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                            >
                              {meal.mealType}
                            </span>
                            <p className="mt-0.5 truncate text-sm font-medium text-gray-800">
                              {meal.recipeName}
                            </p>
                          </div>
                          {meal.kcal > 0 && (
                            <span className="shrink-0 text-xs text-gray-500">{meal.kcal} kcal</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>

        {/* Nutrition — inline here below xl, in the right rail above it. */}
        <NutritionSummary
          nutrition={d.nutrition}
          nextMealName={d.nextMeal?.recipe.name}
          className="xl:hidden"
        />

        {/* Next Meal spotlight */}
        {heroMeal ? (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            {/* Stacked on phones — a 128px fixed photo beside text leaves the
                title ~150px and it wraps to four lines. */}
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
              {/* Recipe photo */}
              <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-32">
                <Image
                  {...getRecipeImageProps(heroMeal.recipe.imageUrl)}
                  alt={heroMeal.recipe.name}
                  fill
                  sizes="(max-width: 639px) 100vw, 128px"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#944a00] px-2.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      {heroIsTomorrow ? 'Tomorrow' : 'Next Meal'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${MEAL_COLOURS[heroMeal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {heroMeal.mealType}
                    </span>
                  </div>
                  <h2 className="font-serif text-lg font-bold leading-snug text-gray-900">
                    {heroMeal.recipe.name}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                    {heroMeal.recipe.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {heroMeal.recipe.prepTimeMins} min
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Flame className="h-3.5 w-3.5 text-[#944a00]" />
                    {heroMeal.recipe.kcal} kcal
                  </span>
                  <Link
                    href={
                      heroIsTomorrow
                        ? `/recipes/${heroMeal.recipe.id}`
                        : `/recipes/${heroMeal.recipe.id}/cook?meal=${heroMeal.mealType}`
                    }
                    className="flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-[#944a00] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#7a3d00] sm:ml-auto sm:min-h-0 sm:w-auto"
                  >
                    {heroIsTomorrow ? 'View Recipe' : 'Start Cooking'}{' '}
                    <ArrowRight className="h-3.5 w-3.5" />
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

        {/* Rest of Today — only when today is selected (or nothing selected) */}
        {d.restOfToday.length > 0 && (selectedDayIdx === null || selectedDayIdx === todayIdx) && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Rest of Today
            </p>
            <div className="flex flex-col divide-y">
              {d.restOfToday.map((meal, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-2.5">
                  {/* Time + badge on one line, name below — the original single
                      row had no min-w-0 and long recipe names pushed the kcal
                      column off the card. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 sm:w-16">{meal.scheduledLabel}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {meal.mealType}
                      </span>
                    </div>
                    <span className="truncate text-sm font-medium text-gray-700">
                      {meal.recipeName}
                    </span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
                    {meal.kcal} kcal
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Progress Chart */}
        {weekSummary && weekSummary.days.some((d) => d.hasLog) && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                This Week — Calories
              </p>
              <Link href="/progress" className="text-xs font-medium text-[#944a00] hover:underline">
                Full Progress →
              </Link>
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart
                data={weekSummary.days.map((d) => ({
                  date: format(parseISO(d.date), 'EEE'),
                  logged: d.hasLog ? d.totalKcal : null,
                  target: weekSummary.dailyCalorieTarget,
                }))}
              >
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(val) => [`${String(val)} kcal`]} />
                <ReferenceLine
                  y={weekSummary.dailyCalorieTarget}
                  stroke="#d1d5db"
                  strokeDasharray="3 3"
                />
                <Line
                  type="monotone"
                  dataKey="logged"
                  stroke="#944a00"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recent Favourites */}
        <div className="overflow-hidden rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Recent Favourites
            </p>
            <Link
              href="/recipes?filter=saved"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-[#944a00] hover:underline"
            >
              View All →
            </Link>
          </div>
          {d.recentFavourites.length > 0 ? (
            // Negative margin + matching padding lets cards bleed to the card
            // edge as you scroll, which reads as "there is more this way".
            <div className="scroll-rail -mx-4 gap-4 px-4 pb-1 sm:-mx-5 sm:px-5">
              {d.recentFavourites.map((fav) => (
                <Link
                  key={fav.id}
                  href={`/recipes/${fav.id}`}
                  className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-xl border p-1 pb-2 transition-all hover:border-[#944a00]/40 hover:shadow-md"
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
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">
                      {fav.cuisineType} · {fav.prepTimeMins}m
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Save a recipe to see it here.{' '}
              <Link href="/meal-plan" className="text-[#944a00] hover:underline">
                Go to Meal Planner →
              </Link>
            </p>
          )}
        </div>

        {/* Sign-off */}
        <p className="pb-2 text-center text-xs italic text-gray-500">You&apos;ve got this, chef.</p>
      </div>

      {/* ── Right rail — xl+ only. Below that the same panel renders inline
             in the main column above. ─────────────────────────────────────── */}
      <div className="hidden w-72 shrink-0 flex-col gap-4 xl:flex">
        <NutritionSummary
          nutrition={d.nutrition}
          nextMealName={d.nextMeal?.recipe.name}
          className="sticky top-6"
        />
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 xl:flex-row xl:gap-6 xl:p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-6">
        <div className="h-12 w-56 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-gray-100 xl:hidden" />
        <div className="h-36 w-full animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-32 w-full animate-pulse rounded-2xl bg-gray-100" />
      </div>
      <div className="hidden w-72 xl:block">
        <div className="h-96 w-full animate-pulse rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}
