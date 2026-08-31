import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import type { RouterOutputs } from '../../../lib/trpc';
import { MealTypeBadge } from './meal-type-badge';

// Port of the web dashboard's "Weekly Outlook" card: seven day chips (today
// highlighted, dot = has meals) with a tappable per-day meal list.

type WeekPlan = RouterOutputs['dashboard']['summary']['weekPlan'];

export function WeekOutlook({ weekPlan }: { weekPlan: WeekPlan }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

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
      hasMeals: weekPlan.some((wp) => wp.dayOfWeek === i && wp.meals.length > 0),
    };
  });

  const selected = selectedDayIdx === null ? null : days[selectedDayIdx];
  const selectedMeals =
    selectedDayIdx === null
      ? []
      : (weekPlan.find((wp) => wp.dayOfWeek === selectedDayIdx)?.meals ?? []);

  return (
    <Card testID="week-outlook">
      <Text className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
        Weekly Outlook
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1.5"
      >
        {days.map((day) => {
          const isToday = day.idx === todayIdx;
          const isSelected = selectedDayIdx === day.idx;
          return (
            <Pressable
              key={day.idx}
              testID={`day-chip-${day.idx}`}
              accessibilityRole="button"
              onPress={() => setSelectedDayIdx(isSelected ? null : day.idx)}
              className={cn(
                'w-[52px] items-center gap-1 rounded-xl py-3',
                isToday ? 'bg-primary' : isSelected ? 'bg-accent' : 'bg-gray-50',
              )}
            >
              <Text
                className={cn(
                  'text-[10px] font-semibold uppercase',
                  isToday ? 'text-primary-foreground' : 'text-gray-600',
                )}
              >
                {day.label}
              </Text>
              <Text
                className={cn(
                  'text-sm font-bold',
                  isToday ? 'text-primary-foreground' : 'text-gray-700',
                )}
              >
                {day.num}
              </Text>
              <View
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  !day.hasMeals ? 'bg-transparent' : isToday ? 'bg-white/70' : 'bg-primary',
                )}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      {selected && (
        <View className="mt-4 border-t border-border pt-4">
          <Text className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            {selectedDayIdx === todayIdx
              ? "Today's Meals"
              : `${selected.label} ${selected.num}${(selectedDayIdx ?? 0) < todayIdx ? ' — Past' : ' — Upcoming'}`}
          </Text>
          {selectedMeals.length === 0 ? (
            <View className="rounded-xl bg-gray-50 px-4 py-3">
              <Text className="text-sm text-gray-500">No meals planned for this day.</Text>
            </View>
          ) : (
            <View className="gap-2">
              {selectedMeals.map((meal) => (
                <View
                  key={`${meal.mealType}-${meal.recipeId}`}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-gray-50 p-2.5"
                >
                  <Image
                    source={{ uri: getRecipeImageUrl(meal.imageUrl) }}
                    className="h-12 w-12 rounded-lg"
                    resizeMode="cover"
                  />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <MealTypeBadge mealType={meal.mealType} />
                    <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                      {meal.recipeName}
                    </Text>
                  </View>
                  {meal.kcal > 0 && <Text className="text-xs text-gray-500">{meal.kcal} kcal</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
