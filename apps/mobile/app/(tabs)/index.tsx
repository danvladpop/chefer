import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Card, Screen, Text } from '@chefer/ui-mobile';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { MealTypeBadge } from '../../src/features/dashboard/components/meal-type-badge';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Home tab — port of apps/web (dashboard)/dashboard/page.tsx (M2-1).
// Deviations from web, deliberate: no weight/coach cards yet (coach feature
// arrives with M2-9/M2-10; the recharts weight chart needs an RN chart lib),
// and the calorie ring is a bar (see nutrition-summary.tsx).
export default function HomeScreen() {
  const { data: d, isLoading, refetch, isRefetching } = trpc.dashboard.summary.useQuery();

  const isPremium = useIsPremium();
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: isPremium === true,
    staleTime: 60_000,
  });
  const showProfileNudge = isPremium === true && hasProfile === false;

  if (isLoading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen className="items-center justify-center gap-2">
        <Text variant="muted">Couldn&apos;t load your dashboard.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void refetch()}
          className="min-h-11 justify-center px-4"
        >
          <Text className="font-semibold text-primary">Try again</Text>
        </Pressable>
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
        {/* Header */}
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            {hasPlan ? 'Welcome Back, Chef' : 'Welcome, Chef'}
          </Text>
          <Text testID="home-title" variant="title" className="mt-0.5">
            Your Daily Overview
          </Text>
          <Text variant="muted" className="mt-1 text-sm">
            {d.today.date}
          </Text>
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

        {/* Profile completion nudge (premium without a profile) */}
        {showProfileNudge && (
          <Card testID="profile-nudge" className="border-primary/20 bg-accent">
            <Text className="text-sm font-semibold text-primary">Complete your profile</Text>
            <Text className="mt-0.5 text-xs text-primary/80">
              Tell the AI chef your goals, body metrics and dietary needs so your meal plans are
              built for you.
            </Text>
          </Card>
        )}

        <WeekOutlook weekPlan={d.weekPlan} />

        <NutritionSummary nutrition={d.nutrition} />

        {heroMeal ? (
          <HeroMealCard meal={heroMeal} isTomorrow={heroIsTomorrow} />
        ) : (
          <Card>
            <Text variant="muted">
              No upcoming meals planned. Head to the Plan tab to get started.
            </Text>
          </Card>
        )}

        {/* Rest of today */}
        {d.restOfToday.length > 0 && (
          <Card testID="rest-of-today">
            <Text className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Later Today
            </Text>
            <View className="gap-2.5">
              {d.restOfToday.map((meal) => (
                <View key={meal.mealType} className="flex-row items-center gap-3">
                  <MealTypeBadge mealType={meal.mealType} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                      {meal.recipeName}
                    </Text>
                    <Text className="text-xs text-gray-500">{meal.scheduledLabel}</Text>
                  </View>
                  {meal.kcal > 0 && <Text className="text-xs text-gray-500">{meal.kcal} kcal</Text>}
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Recent favourites */}
        {d.recentFavourites.length > 0 && (
          <View>
            <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
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
    </Screen>
  );
}
