import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, router, useFocusEffect } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { localDateStr } from '@chefer/utils';
import { ChefReviewBanner } from '../../src/features/coach/chef-review-banner';
import { WeightCard } from '../../src/features/coach/weight-card';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { MealTypeBadge } from '../../src/features/dashboard/components/meal-type-badge';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { TodaysWorkoutCard } from '../../src/features/gym/today/todays-workout-card';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';
import { ScanMealCard } from '../../src/features/tracker/scan-meal-card';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Today tab — port of apps/web (dashboard)/dashboard/page.tsx (M2-1, P2-2).
// Home and the Tracker merged into one daily surface: what you ate against
// the target (animated ring, MO-06), quick add / scan, the next meal with a
// one-tap "I ate this" that advances past logged meals, and "See full day"
// into the full tracker (which left More). Deviation from web, deliberate:
// scanning shows the premium Snap-to-log card (no free demo sheet on mobile).
export default function HomeScreen() {
  // The device's own day and hour decide "today" and the next meal (F-DASH-1-1).
  const {
    data: d,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.dashboard.summary.useQuery({
    localDate: localDateStr(),
    localHour: new Date().getHours(),
  });

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
        <View className="flex-1 items-center justify-center gap-2">
          <Text variant="muted">Couldn&apos;t load your dashboard.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refetch()}
            className="min-h-11 justify-center px-4"
          >
            <Text className="font-semibold text-primary">Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const hasPlan = d.weekPlan.length > 0;
  const heroMeal = d.nextMeal ?? d.tomorrowFirstMeal;
  const heroIsTomorrow = !d.nextMeal && d.tomorrowFirstMeal !== null;

  return (
    <Screen className="px-0">
      <ScrollView
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <ModeSwitch />

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

        {/* F1 Adaptive Chef: weekly review (full for premium, teaser for free) */}
        <ChefReviewBanner />

        {/* Profile completion nudge (premium without a profile) */}
        {showProfileNudge && (
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
            fields, so server-side target changes flow straight through. */}
        <NutritionSummary nutrition={d.nutrition} />

        {/* Off-plan logging: free quick add + premium Snap-to-log */}
        <Button testID="today-quick-add" variant="outline" onPress={() => setQuickAddOpen(true)}>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="add" size={18} color="#944a00" />
            <Text className="text-sm font-medium text-primary">Quick add</Text>
          </View>
        </Button>
        <ScanMealCard date={localDateStr()} onLogged={() => void refetch()} />

        {heroMeal ? (
          <HeroMealCard meal={heroMeal} isTomorrow={heroIsTomorrow} />
        ) : (
          <Card testID="today-no-meal">
            <Text variant="muted">
              {hasPlan
                ? "You're all caught up for today."
                : 'No meals planned yet. Head to the Plan tab to get started.'}
            </Text>
          </Card>
        )}

        {/* Rest of today */}
        {d.restOfToday.length > 0 && (
          <Card testID="rest-of-today">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Later today
            </Text>
            <View className="gap-2.5">
              {d.restOfToday.map((meal) => (
                <Pressable
                  key={meal.mealType}
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

        <WeekOutlook weekPlan={d.weekPlan} />

        <WeightCard />

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
      </ScrollView>

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={localDateStr()}
        onLogged={() => void refetch()}
      />
    </Screen>
  );
}
