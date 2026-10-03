'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChefReviewBanner } from '@/features/coach/components/ChefReviewBanner';
import { WeightCard } from '@/features/coach/components/WeightCard';
import { NextMealCard } from '@/features/dashboard/components/next-meal-card';
import { NutritionSummary } from '@/features/dashboard/components/nutrition-summary';
import { ShopDueCard } from '@/features/dashboard/components/shop-due-card';
import { TomorrowCard } from '@/features/dashboard/components/tomorrow-card';
import { NothingTonightCard, TonightCard } from '@/features/dashboard/components/tonight-card';
import { TodaysWorkoutCard } from '@/features/gym/shared/todays-workout-card';
import {
  ReplaceMealSheet,
  type ReplaceTarget,
} from '@/features/meal-plan/components/ReplaceMealSheet';
import {
  HealthConsentLaunchPrompt,
  HealthConsentTodayNotice,
} from '@/features/privacy/components/HealthConsentNudges';
import { QuickAddSheet } from '@/features/tracker/components/QuickAddSheet';
import { ScanMealButton } from '@/features/tracker/components/ScanMealButton';
import { useIsPremium } from '@/hooks/useIsPremium';
import { capture } from '@/lib/analytics';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ErrorState } from '@chefer/ui';
import { formatDate, localDateStr, remainingPlannedKcal } from '@chefer/utils';

// ─── Meal type colours ─────────────────────────────────────────────────────────

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

// UX-04 §2: which moment band the clock is in, deciding the hero card
// (T-04.7 — same bands as mobile's (food)/index.tsx).
type Moment = 'morning' | 'evening' | 'late';
function momentFor(hour: number): Moment {
  if (hour >= 16 && hour < 21.5) return 'evening';
  if (hour >= 21.5 || hour < 4) return 'late';
  return 'morning';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Today (P2-2, PM review §5): Home and the Tracker merged into one daily
// surface — what you ate against the target, the next meal with a one-tap
// "I ate this", quick add / scan, and "Full day" into the full tracker.
export default function DashboardPage() {
  // The device's own day and hour decide "today" and the next meal (F-DASH-1-1).
  const { data, isLoading, isError, isRefetching, refetch } = trpc.dashboard.summary.useQuery({
    localDate: localDateStr(),
    localHour: new Date().getHours(),
    include: ['tonight', 'tomorrow', 'shopDue', 'safetyChecks'],
  });
  const { data: weekSummary } = trpc.tracker.weeklySummary.useQuery(undefined, {
    staleTime: 60_000,
  });
  // §2.11, T-35.5: the ring's "Your target" / "Suggested" label.
  const { data: targetsData } = trpc.targets.get.useQuery();

  // Profile completion nudge: surface it here rather than letting the user
  // discover the gap only when "Generate plan" asks for a profile.
  const isPremium = useIsPremium();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: isPremium === true,
    staleTime: 60_000,
  });
  const showProfileNudge = isPremium === true && hasProfile === false;

  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  // T-04.7 delta: Tonight's Swap opens the existing ReplaceMealSheet inline
  // (L-SAFE2's) instead of navigating to the full Plan.
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);

  // Quick add / scan land in today's log: refresh the ring and the spotlight.
  const utils = trpc.useUtils();
  const onLogged = () => {
    void utils.dashboard.summary.invalidate();
    void utils.tracker.getDay.invalidate();
    void utils.tracker.weeklySummary.invalidate();
  };

  // B-13 (T-00.15): Today has no week selector, so the server's fix (reading
  // findForWeek, never findActiveWithDays) is the whole guarantee here —
  // weekMatches is always true by construction. Kept as its own event (not
  // hardcoded downstream) so the wave-1 analytics dictionary reads the same
  // shape from every surface.
  useEffect(() => {
    if (!data) return;
    capture('plan_shown', { surface: 'today', weekMatches: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per load
  }, [data?.today.date]);

  if (isLoading) return <DashboardSkeleton />;

  const d = data;
  // A failed load rendered a blank page (audit F-DASH-1-3, F-X-3-1).
  if (!d) {
    return isError ? (
      <div className="mx-auto max-w-3xl p-4 lg:p-6">
        <ErrorState
          title="Couldn't load your dashboard"
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      </div>
    ) : null;
  }

  const hasPlan = d.weekPlan.length > 0;
  // B-31 (T-04.7): the ring, weight card, profile nudge and Snap-to-log all
  // assume a goal — meaningless for someone who only wants to log what they
  // ate. `showNutrition` is the explicit-override-aware successor to the
  // interim `showNutritionCards` (T-00.12): a goal, `Track what I eat`, or
  // the Settings toggle.
  const showNutritionCards = d.showNutrition;

  // UX-04 §2/§3: which hero card leads — Tonight (today's dinner) in the
  // evening band, its done collapse once dinner is logged, Tomorrow once
  // dinner is done or it's late (AC5: never "NEXT UP · BREAKFAST" at
  // 22:00), else the existing "next up" hero (today's next open window).
  const moment = momentFor(new Date().getHours());
  const dinnerDone = d.tonight?.done === true;
  const showTonightCard = moment === 'evening' && !!d.tonight && !dinnerDone;
  const showTonightDoneRow = dinnerDone;
  const showNothingTonight = moment === 'evening' && !d.tonight && !dinnerDone;
  const showTomorrowCard = (moment === 'late' || dinnerDone) && !!d.tomorrow;
  const heroMeal =
    !showTonightCard && !showTonightDoneRow && !showNothingTonight && !showTomorrowCard
      ? (d.nextMeal ?? d.tomorrowFirstMeal)
      : null;
  const heroIsTomorrow = !d.nextMeal && d.tomorrowFirstMeal !== null;

  // Day‑of‑week labels Mon–Sun
  const today = new Date();
  const jsDay = today.getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - todayIdx + i);
    return {
      label: formatDate(date, 'weekday'),
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

        {/* F1 Adaptive Chef: weekly review (full for premium, blurred teaser
            for free) — renders nothing until a review exists and is fresh. */}
        <ChefReviewBanner />

        {/* B-31 interim (T-00.12): hidden with the other goal-assuming cards
            below until the user has a goal or already tracks. */}
        {showNutritionCards && showProfileNudge && (
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

        {/* UX-26: Q-7 launch prompt (pending counsel) + the "Plans aren't being checked" nudge. */}
        <HealthConsentLaunchPrompt />
        <HealthConsentTodayNotice />

        {/* Header */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {d.today.date}
            </p>
            <h1 className="mt-0.5 font-serif text-xl font-bold text-gray-900 sm:text-2xl">Today</h1>
          </div>
          {/* The full tracker (portions, past days, un-logging) stays one tap
              away — Tracker left More when it became Today (F-PM-7). */}
          <Link
            href="/tracker"
            data-testid="today-full-day"
            className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-[#944a00] hover:underline"
          >
            See full day <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* What you ate vs target — inline here below xl, in the right rail
            above it. The ring reads the dashboard summary's nutrition fields,
            so target changes made server-side flow straight through. B-31
            interim (T-00.12): hidden for a goal-less, non-tracking user. */}
        {showNutritionCards && (
          <NutritionSummary
            nutrition={d.nutrition}
            targetMode={targetsData?.targetMode}
            remainingPlannedKcal={remainingPlannedKcal(d.nextMeal, d.restOfToday)}
            className="xl:hidden"
          />
        )}

        {/* Off-plan logging: free quick add + premium scan (demo for free).
            Quick add stays available to everyone; scan is nutrition-tracking
            gear (B-31 interim). */}
        <div className="flex flex-wrap gap-2" data-testid="today-quick-log">
          <QuickAddSheet date={localDateStr()} onLogged={onLogged} />
          {showNutritionCards && (
            <ScanMealButton date={localDateStr()} isPremium={isPremium} onLogged={onLogged} />
          )}
        </div>

        {/* UX-04 §3: Tonight (evening, AC3) -> its done collapse -> Tomorrow
            (late/AC5, never "NEXT UP · BREAKFAST" at 22:00) -> the existing
            "next up" hero for the daytime band. */}
        {(showTonightCard || showTonightDoneRow) && d.tonight && (
          <TonightCard
            meal={d.tonight}
            showNutrition={showNutritionCards}
            onLogged={onLogged}
            onSwap={() => {
              const tonight = d.tonight;
              if (!tonight) return;
              setReplaceTarget({
                planId: tonight.planId,
                dayOfWeek: tonight.dayOfWeek,
                mealType: tonight.mealType,
                slotIndex: tonight.slotIndex,
                mealName: tonight.recipe.name,
                recipeId: tonight.recipe.id,
              });
            }}
          />
        )}
        {showNothingTonight && <NothingTonightCard />}
        {showTomorrowCard && d.tomorrow && <TomorrowCard meal={d.tomorrow} />}
        {/* Shop-due (T-04.2/T-04.7): tomorrow's unticked shopping-list lines. */}
        {d.shopDue && <ShopDueCard shopDue={d.shopDue} />}

        {/* Next meal spotlight — advances past meals already logged today */}
        {heroMeal ? (
          <NextMealCard meal={heroMeal} isTomorrow={heroIsTomorrow} />
        ) : showTonightCard ||
          showTonightDoneRow ||
          showNothingTonight ||
          showTomorrowCard ? null : hasPlan ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-white py-8 text-center shadow-sm">
            <span className="text-3xl">🎉</span>
            <p className="font-medium text-gray-700">You&apos;re all caught up for today!</p>
            <Link
              href="/meal-plan"
              className="touch-target relative text-sm text-[#944a00] hover:underline"
            >
              View full plan →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-white py-10 text-center shadow-sm">
            <span className="text-4xl">🥣</span>
            <div>
              <p className="font-semibold text-gray-800">Your weekly menu awaits</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {/* Tier-honest copy: free plans are chef-curated, not AI (F-DASH-1-5). */}
                {isPremium
                  ? 'Let the chef craft a personalised 7-day plan for you.'
                  : 'Get a 7-day plan of chef-curated recipes that respect your allergies.'}
              </p>
            </div>
            {/* ?generate=1 starts generation on arrival — the button used to
                say "Generate" but only navigated (prod-followups #9) */}
            <Link
              href="/meal-plan?generate=1"
              className="inline-flex min-h-11 items-center rounded-full bg-[#944a00] px-5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
            >
              Generate My Week
            </Link>
          </div>
        )}

        {/* Later today — uneaten meals after the spotlight */}
        {d.restOfToday.length > 0 && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Later today
            </p>
            <div className="flex flex-col divide-y">
              {d.restOfToday.map((meal, i) => (
                <Link
                  key={i}
                  href={meal.recipeId ? `/recipes/${meal.recipeId}` : '/meal-plan'}
                  className="-mx-2 flex min-h-11 items-start justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-neutral-50"
                >
                  {/* Time + badge on one line, name below — the original single
                      row had no min-w-0 and long recipe names pushed the kcal
                      column off the card. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 sm:w-16">{meal.scheduledLabel}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
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
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Outlook card */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Weekly Outlook
            </p>
            <Link
              href="/meal-plan"
              className="touch-target relative shrink-0 whitespace-nowrap text-xs font-medium text-[#944a00] hover:underline"
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
                  <span className="text-xs font-semibold uppercase">{day.label}</span>
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
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
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
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
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

        {/* Weekly Progress Chart */}
        {weekSummary && weekSummary.days.some((d) => d.hasLog) && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                This Week — Calories
              </p>
              <Link
                href="/progress"
                className="touch-target relative text-xs font-medium text-[#944a00] hover:underline"
              >
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

        {/* F1: weight quick-entry + 30-day sparkline (free — feeds coaching).
            B-31 interim (T-00.12): weight tracking assumes a goal. */}
        {showNutritionCards && <WeightCard />}

        {/* Gym (D11): next workout / done + week ring; opens Gym mode */}
        <TodaysWorkoutCard />

        {/* Recent Favourites */}
        <div className="overflow-hidden rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Recent Favourites
            </p>
            <Link
              href="/recipes?filter=saved"
              className="touch-target relative shrink-0 whitespace-nowrap text-xs font-medium text-[#944a00] hover:underline"
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
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      {fav.cuisineType} · {fav.prepTimeMins}m
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Save a recipe to see it here.{' '}
              <Link
                href="/meal-plan"
                className="touch-target relative text-[#944a00] hover:underline"
              >
                Go to Meal Planner →
              </Link>
            </p>
          )}
        </div>

        {/* Sign-off */}
        <p className="pb-2 text-center text-xs italic text-gray-500">You&apos;ve got this, chef.</p>
      </div>

      {/* ── Right rail — xl+ only. Below that the same panel renders inline
             in the main column above. B-31 interim (T-00.12): the rail holds
             only the nutrition panel, so it is omitted entirely when that is
             hidden — otherwise goal-less users get an empty 288px column. ── */}
      {showNutritionCards && (
        <div className="hidden w-72 shrink-0 flex-col gap-4 xl:flex">
          <NutritionSummary
            nutrition={d.nutrition}
            targetMode={targetsData?.targetMode}
            remainingPlannedKcal={remainingPlannedKcal(d.nextMeal, d.restOfToday)}
            className="sticky top-6"
          />
        </div>
      )}

      {/* Closes and invalidates dashboard.summary itself on a successful
          replace/AI-swap — Tonight picks up the new recipe automatically. */}
      <ReplaceMealSheet target={replaceTarget} onClose={() => setReplaceTarget(null)} />
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
