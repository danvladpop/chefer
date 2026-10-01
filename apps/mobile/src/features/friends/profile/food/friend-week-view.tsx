import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendWeekDto } from '@chefer/types';
import { DENSE_MAX_FONT_SCALE, EmptyState, ErrorState, Skeleton, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../../../../lib/trpc';
import { MealCardView } from '../../../meal-plan/meal-card-view';
import { formatDayMonth, weekdayFull, WEEKDAYS_SHORT } from '../format';

// ─── FriendWeekView: another person's current week, read-only (UX §9.2) ───────
// `friends.week` (never `mealPlan.getForWeek` — that writes on read, INV-4).
// Day chips with the owner's today ringed and selected by default, empty days
// dimmed but selectable; meal cards via the presentational `MealCardView`
// (no swap, pin, safety chip, tailoring mark or cost); day totals without any
// target comparison, plus one muted line when targets are shared. Numbers
// without judgement: no red/green anywhere.

export type FriendWeekViewProps = {
  userId: string;
  firstName: string;
  /** False on my own preview when I don't share targets (UX §8.3). */
  showTargets: boolean;
  testID?: string;
};

type Meal = FriendWeekDto['days'][number]['meals'][number];

export function FriendWeekView({
  userId,
  firstName,
  showTargets,
  testID = 'friends-week',
}: FriendWeekViewProps) {
  const week = trpc.friends.week.useQuery({ userId }, { retry: false });
  const [selected, setSelected] = useState<number | null>(null);
  const data = week.data;
  useEffect(() => {
    if (data && selected === null) setSelected(data.todayIndex);
  }, [data, selected]);

  if (week.isLoading) return <WeekSkeleton testID={`${testID}-loading`} />;
  if (week.isError && !data) {
    return (
      <ErrorState
        testID={`${testID}-error`}
        title={FRIENDS_COPY.profile.error}
        onRetry={() => void week.refetch()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        testID={`${testID}-no-plan`}
        icon={<Ionicons name="calendar-outline" size={40} color="#9ca3af" />}
        title={FRIENDS_COPY.food.noPlan(firstName)}
      />
    );
  }

  const day = selected ?? data.todayIndex;
  const dayData = data.days.find((d) => d.dayOfWeek === day);
  const meals = dayData?.meals ?? [];

  return (
    <View testID={testID} className="gap-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
        <Text testID={`${testID}-week-of`} className="font-semibold text-gray-900">
          {FRIENDS_COPY.food.weekOf(formatDayMonth(data.weekStartDate))}
        </Text>
        {data.averageKcal !== null ? (
          <Text testID={`${testID}-avg`} variant="muted">
            {FRIENDS_COPY.food.avg(data.averageKcal)}
          </Text>
        ) : null}
      </View>

      <WeekDayChips testID={`${testID}-day`} week={data} selected={day} onSelect={setSelected} />

      {meals.length === 0 ? (
        <Text testID={`${testID}-empty-day`} variant="muted" className="py-4 text-center">
          {FRIENDS_COPY.food.emptyDay(weekdayFull(day))}
        </Text>
      ) : (
        <View className="gap-3">
          {meals.map((meal, i) => (
            <FriendMealCard
              key={`${meal.type}-${i}`}
              testID={`${testID}-meal-${day}-${i}`}
              meal={meal}
              ownerId={userId}
            />
          ))}
        </View>
      )}

      {dayData && meals.length > 0 ? (
        <View testID={`${testID}-totals`} className="gap-1 rounded-xl bg-gray-50 px-3 py-2">
          <Text className="text-sm font-bold text-gray-900">
            {FRIENDS_COPY.food.dayTotal(dayData.totals.kcal)}
          </Text>
          <Text className="text-xs text-gray-600">{macroLine(dayData.totals)}</Text>
          {showTargets && data.targets ? (
            <Text testID={`${testID}-target`} variant="muted" className="text-xs">
              {FRIENDS_COPY.food.target(data.targets.kcal, data.targets.protein)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** `P 142 g · C 210 g · F 70 g` (the second half of `food.macros`). */
function macroLine(t: { protein: number; carbs: number; fat: number }): string {
  return FRIENDS_COPY.food
    .macros(0, Math.round(t.protein), Math.round(t.carbs), Math.round(t.fat))
    .split(' · ')
    .slice(1)
    .join(' · ');
}

export function FriendMealCard({
  meal,
  ownerId,
  testID,
}: {
  meal: Meal;
  ownerId: string;
  testID: string;
}) {
  const { recipe, totals } = meal;
  const macros = FRIENDS_COPY.food.macros(
    Math.round(totals.kcal),
    Math.round(totals.protein),
    Math.round(totals.carbs),
    Math.round(totals.fat),
  );
  const hidden = recipe.hidden;
  return (
    <MealCardView
      testID={testID}
      mealType={meal.type}
      name={hidden ? FRIENDS_COPY.food.hiddenRecipe : recipe.name}
      imageUrl={recipe.imageUrl}
      placeholder={hidden}
      {...(hidden
        ? { accessibilityLabel: FRIENDS_COPY.food.hiddenRecipeLabel(Math.round(totals.kcal)) }
        : {
            onPress: () =>
              router.push({
                pathname: '/recipe/[id]',
                params: { id: recipe.id, owner: ownerId },
              }),
          })}
      badges={
        meal.leftoverOf ? (
          <View className="rounded-full bg-gray-100 px-2 py-0.5">
            <Text className="text-xs text-gray-600">
              {FRIENDS_COPY.food.leftoversFrom(meal.leftoverOf)}
            </Text>
          </View>
        ) : null
      }
      meta={
        <Text testID={`${testID}-macros`} className="text-xs text-gray-600">
          {macros}
        </Text>
      }
    >
      <Text testID={`${testID}-portion`} className="text-xs text-gray-500">
        {FRIENDS_COPY.food.portion(meal.portion)}
      </Text>
    </MealCardView>
  );
}

function WeekDayChips({
  week,
  selected,
  onSelect,
  testID,
}: {
  week: FriendWeekDto;
  selected: number;
  onSelect: (day: number) => void;
  testID: string;
}) {
  return (
    <View className="flex-row justify-between">
      {WEEKDAYS_SHORT.map((label, i) => {
        const isSelected = selected === i;
        const isToday = week.todayIndex === i;
        const hasMeals = week.days.some((d) => d.dayOfWeek === i && d.meals.length > 0);
        return (
          <Pressable
            key={label}
            testID={`${testID}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`${weekdayFull(i)}${isToday ? ', today' : ''}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(i)}
            className={cn(
              'h-14 w-11 items-center justify-center rounded-xl',
              isSelected ? 'bg-primary' : 'bg-gray-50',
              isToday && !isSelected && 'border-2 border-primary',
              !hasMeals && !isSelected && 'opacity-50',
            )}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-[12px] font-semibold uppercase',
                isSelected ? 'text-primary-foreground' : 'text-gray-700',
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WeekSkeleton({ testID }: { testID: string }) {
  return (
    <View testID={testID} className="gap-3" accessibilityLabel="Loading" accessible>
      <Skeleton className="h-5 w-40 rounded-md" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </View>
  );
}
