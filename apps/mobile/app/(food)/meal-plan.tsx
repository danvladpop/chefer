import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, DENSE_MAX_FONT_SCALE, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { cn, formatMoney } from '@chefer/utils';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { RecipePickerSheet } from '../../src/features/meal-plan/recipe-picker-sheet';
import { WeekSummarySheet, type DaySummary } from '../../src/features/meal-plan/week-summary-sheet';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { useCurrency } from '../../src/hooks/use-currency';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { trpc } from '../../src/lib/trpc';

// Plan tab — port of apps/web (dashboard)/meal-plan/page.tsx (M2-2), which
// already renders day-by-day on phones (DayView), incl. the week-rebalance
// banner with undo (P1-7). Deviations, deliberate: recipe-photo SSE
// streaming waits for M3-1; the pantry banner for M2-6/M2-10. Per-meal replace opens RecipePickerSheet (pick a recipe, any
// tier; AI regen in its footer, premium) — mobile-first, not on web yet.

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${weekStart.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

export default function MealPlanScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex());
  const [leftovers, setLeftovers] = useState(false);
  const [poolExhaustedMessage, setPoolExhaustedMessage] = useState<string | null>(null);
  const [personalisation, setPersonalisation] = useState<{
    pinnedDishNames: string[];
    likedCount: number;
    dislikedCount: number;
  } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    mealType: MealType;
    mealName: string;
  } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const isPremium = useIsPremium();
  const isPast = weekOffset < 0;
  const todayIndex = weekOffset === 0 ? getTodayDayIndex() : null;

  const {
    data: plan,
    isLoading,
    isError,
    refetch,
  } = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false });

  // Everything derived from the plan lives on other (kept-mounted) tabs —
  // invalidate it all after any plan mutation so Home/Shop don't go stale.
  const utils = trpc.useUtils();
  const invalidateDerived = () => {
    void utils.dashboard.summary.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };

  const generateMutation = trpc.mealPlan.generate.useMutation({
    onMutate: () => {
      setPoolExhaustedMessage(null);
      setPersonalisation(null);
    },
    onSuccess: (data) => {
      setPersonalisation(data.personalisation ?? null);
      setSummaryOpen(false);
      void refetch();
      invalidateDerived();
    },
    onError: (err) => {
      if (err.data?.code === 'PRECONDITION_FAILED') {
        setPoolExhaustedMessage(err.message);
      }
    },
  });

  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    onSuccess: () => {
      setPickerTarget(null);
      void refetch();
      invalidateDerived();
    },
  });

  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    onSuccess: () => {
      setPickerTarget(null);
      void refetch();
      invalidateDerived();
    },
  });

  const closePicker = () => {
    setPickerTarget(null);
    swapMutation.reset();
    replaceMutation.reset();
  };

  const weekLabel = formatWeekLabel(getMondayOfWeek(weekOffset));
  const day = plan?.days.find((d) => d.dayOfWeek === selectedDay);
  const meals = day?.meals ?? [];
  const weekCost = plan?.estimatedCost?.totalEur ?? null;
  // Costs are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = useCurrency();

  return (
    <Screen className="px-0">
      <ModeSwitch className="mx-4 mt-3" />
      {/* Week navigator */}
      <View className="flex-row items-center justify-between gap-2 px-4 py-3">
        <Pressable
          testID="plan-week-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          disabled={weekOffset <= MIN_OFFSET}
          onPress={() => setWeekOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-lg border border-border',
            weekOffset <= MIN_OFFSET && 'opacity-40',
          )}
        >
          <Ionicons name="chevron-back" size={18} color="#6b7280" />
        </Pressable>
        {/* Tapping the week label opens the WEEK summary (week-level actions
            live there — the screen below stays day-level) */}
        <Pressable
          testID="plan-week-summary"
          accessibilityRole="button"
          // No accessibilityLabel: the Pressable flattens its children into
          // one a11y element, so the label derives from the week text + badge
          // ("21 Sep – 27 Sep This Week") — screen readers and Maestro both
          // see the real content.
          // Guard in onPress, NOT via disabled: a disabled Pressable's subtree
          // (incl. the Past/This Week badge) drops out of the accessibility
          // tree on iOS, blinding Maestro's text asserts.
          onPress={() => {
            if (plan) setSummaryOpen(true);
          }}
          className="min-h-11 min-w-0 flex-shrink flex-row items-center gap-2"
        >
          <Text
            testID="plan-week-label"
            numberOfLines={1}
            maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
            className="min-w-0 flex-shrink text-sm font-medium text-gray-700"
          >
            {weekLabel}
          </Text>
          <View
            className={cn(
              'rounded-full px-2 py-0.5',
              isPast ? 'bg-gray-100' : weekOffset === 0 ? 'bg-accent' : 'bg-blue-50',
            )}
          >
            <Text
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-[12px] font-semibold uppercase',
                isPast ? 'text-gray-500' : weekOffset === 0 ? 'text-primary' : 'text-blue-600',
              )}
            >
              {isPast ? 'Past' : weekOffset === 0 ? 'This Week' : 'Next Week'}
            </Text>
          </View>
          {plan && <Ionicons name="chevron-down" size={14} color="#9ca3af" />}
        </Pressable>
        <Pressable
          testID="plan-week-next"
          accessibilityRole="button"
          accessibilityLabel="Next week"
          disabled={weekOffset >= MAX_OFFSET}
          onPress={() => setWeekOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-lg border border-border',
            weekOffset >= MAX_OFFSET && 'opacity-40',
          )}
        >
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : isError && !plan ? (
        // A failed load is not an empty week — never offer Generate over a
        // plan we couldn't fetch (F-X-3-1).
        <ErrorState
          title="Couldn't load your meal plan"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      ) : !plan ? (
        /* ── Empty week ─────────────────────────────────────────────────── */
        <ScrollView contentContainerClassName="gap-4 px-4 py-6">
          <Card testID="plan-empty" className="items-center border-dashed py-10">
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text className="mb-1 mt-3 font-semibold text-gray-700">
              No meal plan for this week
            </Text>
            <Text variant="muted" className="mb-4 px-4 text-center text-sm">
              {isPremium
                ? 'Generate an AI plan personalised to your profile and ratings.'
                : 'Generate a plan from our curated collection.'}
            </Text>
            {!isPast && (
              <Button
                testID="plan-generate"
                loading={generateMutation.isPending}
                onPress={() =>
                  generateMutation.mutate({ weekOffset, ...(leftovers && { leftovers: true }) })
                }
              >
                {generateMutation.isPending ? 'Cooking up your week…' : 'Generate Plan'}
              </Button>
            )}
            {isPremium === true && !isPast && (
              <View className="mt-4 flex-row items-center gap-2">
                <Switch value={leftovers} onValueChange={setLeftovers} />
                <Text variant="muted" className="text-xs">
                  Cook once, eat twice (leftover lunches)
                </Text>
              </View>
            )}
          </Card>

          {poolExhaustedMessage && (
            <Card className="border-primary/20 bg-accent">
              <Text className="text-sm font-semibold text-primary">
                Our curated plans can&apos;t match your restrictions
              </Text>
              <Text className="mt-1 text-xs text-primary/80">{poolExhaustedMessage}</Text>
              <Text className="mt-2 text-xs font-semibold text-primary">
                Premium builds a plan around them instead — upgrade on the web app.
              </Text>
            </Card>
          )}

          {generateMutation.isError && !poolExhaustedMessage && (
            <Card className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">{generateMutation.error.message}</Text>
            </Card>
          )}
        </ScrollView>
      ) : (
        /* ── Day view ───────────────────────────────────────────────────── */
        <>
          {/* Day chips */}
          <View className="flex-row justify-between px-4 pb-2">
            {DAY_LABELS.map((label, i) => {
              const isSelected = selectedDay === i;
              const isToday = todayIndex === i;
              const hasMeals = plan.days.some((d) => d.dayOfWeek === i && d.meals.length > 0);
              return (
                <Pressable
                  key={label}
                  testID={`plan-day-${i}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedDay(i)}
                  className={cn(
                    'h-14 w-11 items-center justify-center gap-0.5 rounded-xl',
                    isSelected ? 'bg-primary' : isToday ? 'bg-accent' : 'bg-gray-50',
                  )}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
                    className={cn(
                      'text-[12px] font-semibold uppercase',
                      isSelected ? 'text-primary-foreground' : 'text-gray-600',
                    )}
                  >
                    {label}
                  </Text>
                  <View
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      !hasMeals ? 'bg-transparent' : isSelected ? 'bg-white/70' : 'bg-primary',
                    )}
                  />
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerClassName="gap-3 px-4 py-2 pb-8">
            {/* A log elsewhere swapped future meals — say which, offer undo */}
            <RebalanceBanner planId={plan.planId} onUndone={() => void refetch()} />

            {/* Badges row */}
            <View className="flex-row flex-wrap gap-2">
              {plan.carriedOver && (
                <View
                  testID="plan-carried-over"
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1"
                >
                  <Text className="text-xs font-medium text-blue-700">
                    Continued from your last plan
                  </Text>
                </View>
              )}
              {weekCost !== null && (
                <View className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                  <Text className="text-xs font-medium text-emerald-700">
                    ≈ {formatMoney(weekCost, currency)} this week
                  </Text>
                </View>
              )}
              {personalisation && (
                <View className="rounded-full border border-primary/20 bg-accent px-3 py-1">
                  <Text className="text-xs font-medium text-primary">
                    Learned from {personalisation.likedCount} likes ·{' '}
                    {personalisation.dislikedCount} dislikes
                  </Text>
                </View>
              )}
            </View>

            {meals.length === 0 ? (
              <Card className="items-center py-8">
                <Text variant="muted">No meals planned for this day.</Text>
              </Card>
            ) : (
              meals.map((meal) => (
                <PlanMealCard
                  key={`${meal.type}-${meal.recipe.id}`}
                  testID={`plan-meal-${meal.type}`}
                  day={selectedDay}
                  meal={meal}
                  trailing={
                    // Replace this meal — opens the recipe picker sheet (all
                    // tiers; the AI option inside it stays premium)
                    !isPast && (
                      <Pressable
                        testID={`plan-meal-swap-${meal.type}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Replace ${meal.recipe.name}`}
                        onPress={() =>
                          setPickerTarget({ mealType: meal.type, mealName: meal.recipe.name })
                        }
                        className="w-11 items-center justify-center border-l border-border"
                      >
                        <Ionicons name="swap-horizontal-outline" size={18} color="#944a00" />
                      </Pressable>
                    )
                  }
                />
              ))
            )}
          </ScrollView>

          <RecipePickerSheet
            visible={pickerTarget !== null}
            mealName={pickerTarget?.mealName ?? ''}
            busy={replaceMutation.isPending || swapMutation.isPending}
            error={replaceMutation.error?.message ?? swapMutation.error?.message ?? null}
            onSelect={(recipeId) => {
              if (!pickerTarget) return;
              replaceMutation.mutate({
                planId: plan.planId,
                dayOfWeek: selectedDay,
                mealType: pickerTarget.mealType,
                recipeId,
              });
            }}
            onAiSwap={
              isPremium === true
                ? () => {
                    if (!pickerTarget) return;
                    swapMutation.mutate({
                      planId: plan.planId,
                      dayOfWeek: selectedDay,
                      mealType: pickerTarget.mealType,
                    });
                  }
                : undefined
            }
            onClose={closePicker}
          />

          <WeekSummarySheet
            visible={summaryOpen}
            weekLabel={weekLabel}
            badge={isPast ? 'Past week' : weekOffset === 0 ? 'This week' : 'Next week'}
            days={DAY_LABELS.map((label, i): DaySummary => {
              const dayMeals = plan.days.find((d) => d.dayOfWeek === i)?.meals ?? [];
              return {
                label,
                dayIndex: i,
                mealsCount: dayMeals.length,
                totalKcal: dayMeals.reduce((sum, m) => sum + m.recipe.nutritionInfo.calories, 0),
                isToday: todayIndex === i,
              };
            })}
            weekCostEur={weekCost}
            currency={currency}
            isPast={isPast}
            isPremium={isPremium === true}
            leftovers={leftovers}
            onToggleLeftovers={setLeftovers}
            regenerating={generateMutation.isPending}
            onRegenerate={() =>
              generateMutation.mutate({ weekOffset, ...(leftovers && { leftovers: true }) })
            }
            onMyWeeks={() => {
              setSummaryOpen(false);
              router.push('/my-weeks');
            }}
            onSelectDay={(dayIndex) => {
              setSelectedDay(dayIndex);
              setSummaryOpen(false);
            }}
            onClose={() => setSummaryOpen(false)}
          />
        </>
      )}
    </Screen>
  );
}
