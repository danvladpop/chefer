import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData } from '@tanstack/react-query';
import { Link, router, useFocusEffect } from 'expo-router';
import { Button, Card, ErrorState, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { localDateStr, remainingPlannedKcal } from '@chefer/utils';
import { ChefReviewBanner } from '../../src/features/coach/chef-review-banner';
import { WeightCard } from '../../src/features/coach/weight-card';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { MealTypeBadge } from '../../src/features/dashboard/components/meal-type-badge';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { ShopDueCard } from '../../src/features/dashboard/components/shop-due-card';
import { TomorrowCard } from '../../src/features/dashboard/components/tomorrow-card';
import {
  NothingTonightCard,
  TonightCard,
} from '../../src/features/dashboard/components/tonight-card';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { TodaysWorkoutCard } from '../../src/features/gym/today/todays-workout-card';
import { useTimedRefresh } from '../../src/features/gym/today/use-timed-refresh';
import { HealthConsentTodayNotice } from '../../src/features/privacy/health-consent-notice';
import { MigrationCard } from '../../src/features/safety/migration-card';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';
import { ScanMealCard } from '../../src/features/tracker/scan-meal-card';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// UX-04 §2: which moment band the clock is in, deciding the hero card.
type Moment = 'morning' | 'evening' | 'late';
function momentFor(hour: number): Moment {
  if (hour >= 16 && hour < 21.5) return 'evening';
  if (hour >= 21.5 || hour < 4) return 'late';
  return 'morning';
}

// Today tab — port of apps/web (dashboard)/dashboard/page.tsx (M2-1, P2-2).
// Home and the Tracker merged into one daily surface: what you ate against
// the target (animated ring, MO-06), quick add / scan, the next meal with a
// one-tap "I ate this" that advances past logged meals, and "See full day"
// into the full tracker (which left More). Deviation from web, deliberate:
// scanning shows the premium Snap-to-log card (no free demo sheet on mobile).
export default function HomeScreen() {
  // The device's own day and hour decide "today" and the next meal (F-DASH-1-1).
  // UX-FOOD-23: the hour is part of the query key, so when it rolls over the
  // key changes. Keep the previous dashboard on screen while the new hour's
  // summary loads instead of swapping it for a full-screen spinner.
  const {
    data: d,
    isLoading,
    refetch,
  } = trpc.dashboard.summary.useQuery(
    {
      localDate: localDateStr(),
      localHour: new Date().getHours(),
      include: ['tonight', 'tomorrow', 'shopDue', 'safetyChecks'],
    },
    { placeholderData: keepPreviousData },
  );

  // UX-FOOD-13: the pull-to-refresh spinner follows a user pull only (and drops
  // after 10 s even if the refetch hangs). Binding it to `isRefetching` left it
  // stuck, with the list pulled down, whenever a focus refetch ran, e.g. after
  // coming back from the tracker.
  const { refreshing, onRefresh } = useTimedRefresh(refetch);

  // Tab screens stay mounted, so without this the dashboard shows stale data
  // after the plan changes on another tab (React Query only refetches on
  // MOUNT; there is no window-focus signal in RN). Refetch on tab focus.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const isPremium = useIsPremium();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: isPremium === true,
    staleTime: 60_000,
  });
  const showProfileNudge = isPremium === true && hasProfile === false;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // §2.11, T-35.5: the ring's "Your target" / "Suggested" label.
  const { data: targetsData } = trpc.targets.get.useQuery();

  // B-13 (T-00.15): Today has no week selector, so the server's fix (reading
  // findForWeek, never findActiveWithDays) is the whole guarantee here —
  // weekMatches is always true by construction. No mobile analytics SDK yet
  // (see src/features/gym/analytics.ts) — dev-only stub, wired to the real
  // transport in wave 1.
  useEffect(() => {
    if (!d) return;
    if (__DEV__)
      console.warn('[analytics stub] plan_shown', { surface: 'today', weekMatches: true });
  }, [d]);

  if (isLoading) {
    return (
      <Screen>
        <ModeSwitch className="mt-3" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        {/* Offline in the gym: the switch must work even when food data can't load. */}
        <ModeSwitch className="mt-3" />
        <ErrorState
          testID="today-load-error"
          title="Couldn't load your dashboard"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  const hasPlan = d.weekPlan.length > 0;
  // B-31 (T-04.4): the ring, weight card, profile nudge and Snap-to-log all
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
      ? d.nextMeal
      : null;

  return (
    <Screen className="px-0">
      {/* UX-FOOD-08: keyboard-aware, so the weight field and its "+" stay above
          the keyboard (WeightLogForm scrolls itself into view on focus) and
          the first tap on "+" lands (keyboardShouldPersistTaps="handled"). */}
      <KeyboardAwareScrollView
        testID="today-scroll"
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ModeSwitch />

        {/* UX-26 AC2: after "Don't save it", plans aren't being checked for allergies. */}
        <HealthConsentTodayNotice />

        {/* Header */}
        <View className="flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {d.today.date}
            </Text>
            <Text testID="home-title" variant="title" className="mt-0.5">
              Today
            </Text>
          </View>
          {/* The full tracker (portions, past days, un-logging) stays one tap
              away — it left More when it became Today (F-PM-7). */}
          <Pressable
            testID="today-full-day"
            accessibilityRole="button"
            onPress={() => router.push('/tracker')}
            className="min-h-11 flex-row items-center gap-1"
          >
            <Text className="text-sm font-semibold text-primary">See full day</Text>
            <Ionicons name="chevron-forward" size={16} color="#944a00" />
          </Pressable>
        </View>

        {/* PW-5: this week's plan was prepared before the week started */}
        {d.weekReady && d.today.dayOfWeek === 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <Text className="text-sm font-semibold text-emerald-900">Your week is ready</Text>
            <Text className="mt-0.5 text-xs text-emerald-800">
              The chef prepared this week&apos;s plan for you on Sunday
              {d.weekReady.ratedCount > 0
                ? ` — built from ${d.weekReady.ratedCount} dish${d.weekReady.ratedCount === 1 ? '' : 'es'} you rated`
                : ''}
              .
            </Text>
          </Card>
        )}

        {/* T-01.3: the legacy free-text safety review, read back once —
            self-gated, renders nothing once confirmed or never needed. */}
        <MigrationCard />

        {/* F1 Adaptive Chef: weekly review (full for premium, teaser for free) */}
        <ChefReviewBanner />

        {/* Profile completion nudge (premium without a profile) — B-31
            interim: hidden with the other goal-assuming cards below until
            the user has a goal or already tracks (T-00.12). */}
        {showNutritionCards && showProfileNudge && (
          <Link href="/onboarding" asChild>
            <Pressable accessibilityRole="button" testID="profile-nudge">
              <Card className="border-primary/20 bg-accent">
                <Text className="text-sm font-semibold text-primary">Complete your profile →</Text>
                <Text className="mt-0.5 text-xs text-primary/80">
                  Tell the AI chef your goals, body metrics and dietary needs so your meal plans are
                  built for you.
                </Text>
              </Card>
            </Pressable>
          </Link>
        )}

        {/* What you ate vs target — driven by dashboard.summary's nutrition
            fields, so server-side target changes flow straight through.
            B-31 interim (T-00.12): hidden for a goal-less, non-tracking
            user — a ring/target against nothing set is meaningless. */}
        {showNutritionCards && (
          <NutritionSummary
            nutrition={d.nutrition}
            targetMode={targetsData?.targetMode}
            remainingPlannedKcal={remainingPlannedKcal(d.nextMeal, d.restOfToday)}
          />
        )}

        {/* Off-plan logging: free quick add + premium Snap-to-log. Quick add
            stays available to everyone; Snap-to-log is nutrition-tracking
            gear (B-31 interim). */}
        <Button testID="today-quick-add" variant="outline" onPress={() => setQuickAddOpen(true)}>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="add" size={18} color="#944a00" />
            <Text className="text-sm font-medium text-primary">Quick add</Text>
          </View>
        </Button>
        {showNutritionCards && (
          <ScanMealCard date={localDateStr()} onLogged={() => void refetch()} />
        )}

        {/* UX-04 §3: Tonight (evening, AC3) → its done collapse → Tomorrow
            (late/AC5, never "NEXT UP · BREAKFAST" at 22:00) → the existing
            "next up" hero for the daytime band. */}
        {(showTonightCard || showTonightDoneRow) && d.tonight && (
          <TonightCard
            meal={d.tonight}
            showNutrition={showNutritionCards}
            onLogged={() => void refetch()}
          />
        )}
        {showNothingTonight && <NothingTonightCard />}
        {showTomorrowCard && d.tomorrow && <TomorrowCard meal={d.tomorrow} />}
        {heroMeal && <HeroMealCard meal={heroMeal} isTomorrow={false} />}
        {!heroMeal &&
          !showTonightCard &&
          !showTonightDoneRow &&
          !showNothingTonight &&
          !showTomorrowCard && (
            <Card testID="today-no-meal">
              <Text variant="muted">
                {hasPlan
                  ? "You're all caught up for today."
                  : 'No meals planned yet. Head to the Plan tab to get started.'}
              </Text>
            </Card>
          )}

        {/* Shop-due (T-04.2/T-04.4): tomorrow's unticked shopping-list lines. */}
        {d.shopDue && <ShopDueCard shopDue={d.shopDue} />}

        {/* Rest of today */}
        {d.restOfToday.length > 0 && (
          <Card testID="rest-of-today">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Later today
            </Text>
            <View className="gap-2.5">
              {d.restOfToday.map((meal, i) => (
                <Pressable
                  key={`${meal.mealType}-${i}`}
                  testID={`later-today-${meal.mealType}`}
                  accessibilityRole="button"
                  disabled={!meal.recipeId}
                  onPress={() => {
                    if (meal.recipeId) router.push(`/recipe/${meal.recipeId}`);
                  }}
                  className="min-h-11 flex-row items-center gap-3 active:opacity-70"
                >
                  <MealTypeBadge mealType={meal.mealType} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                      {meal.recipeName}
                    </Text>
                    <Text className="text-xs text-gray-500">{meal.scheduledLabel}</Text>
                  </View>
                  {meal.kcal > 0 && <Text className="text-xs text-gray-500">{meal.kcal} kcal</Text>}
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        <WeekOutlook weekPlan={d.weekPlan} weekGlance={d.weekGlance} />

        {/* B-31 interim (T-00.12): weight tracking assumes a goal. */}
        {showNutritionCards && <WeightCard />}

        <TodaysWorkoutCard />

        {/* Recent favourites */}
        {d.recentFavourites.length > 0 && (
          <View>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Recent Favourites
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3"
            >
              {d.recentFavourites.map((fav) => (
                <Link
                  key={fav.id}
                  href={{ pathname: '/recipe/[id]', params: { id: fav.id } }}
                  asChild
                >
                  <Pressable accessibilityRole="button" className="w-36">
                    <Image
                      source={{ uri: getRecipeImageUrl(fav.imageUrl) }}
                      className="h-24 w-36 rounded-xl"
                      resizeMode="cover"
                    />
                    <Text numberOfLines={1} className="mt-1.5 text-sm font-medium text-gray-800">
                      {fav.name}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {fav.cuisineType} · {fav.prepTimeMins} min
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </ScrollView>
          </View>
        )}
      </KeyboardAwareScrollView>

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={localDateStr()}
        onLogged={() => void refetch()}
      />
    </Screen>
  );
}
