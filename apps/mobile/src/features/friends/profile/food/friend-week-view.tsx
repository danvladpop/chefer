import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import type { FriendWeekDto } from '@chefer/types';
import { DENSE_MAX_FONT_SCALE, EmptyState, ErrorState, Skeleton, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../../lib/i18n';
import { trpc } from '../../../../lib/trpc';
import { MealCardView } from '../../../meal-plan/meal-card-view';
import { formatDayMonth, weekdayFull, weekdayShort } from '../format';

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
  const colors = useThemeColors();
  const { t } = useT();
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
        title={t('friends.profile.error')}
        onRetry={() => void week.refetch()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        testID={`${testID}-no-plan`}
        icon={<Ionicons name="calendar-outline" size={40} color={colors.labelTertiary} />}
        title={t('friends.food.noPlan', { first: firstName })}
      />
    );
  }

  const day = selected ?? data.todayIndex;
  const dayData = data.days.find((d) => d.dayOfWeek === day);
  const meals = dayData?.meals ?? [];

  return (
    <View testID={testID} className="gap-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
        <Text testID={`${testID}-week-of`} className="font-semibold text-label">
          {t('friends.food.weekOf', { dMMM: formatDayMonth(data.weekStartDate, t) })}
        </Text>
        {data.averageKcal !== null ? (
          <Text testID={`${testID}-avg`} variant="muted">
            {t('friends.food.avg', { kcal: data.averageKcal })}
          </Text>
        ) : null}
      </View>

      <WeekDayChips testID={`${testID}-day`} week={data} selected={day} onSelect={setSelected} />

      {meals.length === 0 ? (
        <Text testID={`${testID}-empty-day`} variant="muted" className="py-4 text-center">
          {t('friends.food.emptyDay', { weekday: weekdayFull(day, t) })}
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
        <View testID={`${testID}-totals`} className="gap-1 rounded-xl bg-surface-sunken px-3 py-2">
          <Text className="text-sm font-bold text-label">
            {t('friends.food.dayTotal', { kcal: dayData.totals.kcal })}
          </Text>
          <Text className="text-xs text-label-secondary">{macroLine(dayData.totals, t)}</Text>
          {showTargets && data.targets ? (
            <Text testID={`${testID}-target`} variant="muted" className="text-xs">
              {t('friends.food.target', { kcal: data.targets.kcal, p: data.targets.protein })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** `P 142 g · C 210 g · F 70 g`. */
function macroLine(
  totals: { protein: number; carbs: number; fat: number },
  t: Translator['t'],
): string {
  return t('friends.food.macroLine', {
    p: Math.round(totals.protein),
    c: Math.round(totals.carbs),
    f: Math.round(totals.fat),
  });
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
  const { t } = useT();
  const { recipe, totals } = meal;
  const macros = t('friends.food.macros', {
    kcal: Math.round(totals.kcal),
    p: Math.round(totals.protein),
    c: Math.round(totals.carbs),
    f: Math.round(totals.fat),
  });
  const hidden = recipe.hidden;
  return (
    <MealCardView
      testID={testID}
      mealType={meal.type}
      name={hidden ? t('friends.food.hiddenRecipe') : recipe.name}
      imageUrl={recipe.imageUrl}
      placeholder={hidden}
      {...(hidden
        ? {
            accessibilityLabel: t('friends.food.hiddenRecipeLabel', {
              kcal: Math.round(totals.kcal),
            }),
          }
        : {
            onPress: () =>
              router.push({
                pathname: '/recipe/[id]',
                params: { id: recipe.id, owner: ownerId },
              }),
          })}
      badges={
        meal.leftoverOf ? (
          <View className="rounded-full bg-surface-sunken px-2 py-0.5">
            <Text className="text-xs text-label-secondary">
              {t('friends.food.leftoversFrom', { day: meal.leftoverOf })}
            </Text>
          </View>
        ) : null
      }
      meta={
        <Text testID={`${testID}-macros`} className="text-xs text-label-secondary">
          {macros}
        </Text>
      }
    >
      <Text testID={`${testID}-portion`} className="text-xs text-label-tertiary">
        {t('friends.food.portion', { count: meal.portion })}
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
  const { t } = useT();
  return (
    <View className="flex-row justify-between">
      {Array.from({ length: 7 }, (_, i) => {
        const label = weekdayShort(i, t);
        const isSelected = selected === i;
        const isToday = week.todayIndex === i;
        const hasMeals = week.days.some((d) => d.dayOfWeek === i && d.meals.length > 0);
        return (
          <Pressable
            key={label}
            testID={`${testID}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={
              isToday
                ? t('friends.food.todayDay', { weekday: weekdayFull(i, t) })
                : weekdayFull(i, t)
            }
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(i)}
            className={cn(
              'h-14 w-11 items-center justify-center rounded-xl',
              isSelected ? 'bg-primary' : 'bg-surface-sunken',
              isToday && !isSelected && 'border-2 border-primary',
              !hasMeals && !isSelected && 'opacity-50',
            )}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-xs font-semibold uppercase',
                isSelected ? 'text-primary-foreground' : 'text-label-secondary',
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
  const { t } = useT();
  return (
    <View
      testID={testID}
      className="gap-3"
      accessibilityLabel={t('friends.profile.loadingLabel')}
      accessible
    >
      <Skeleton className="h-5 w-40 rounded-md" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </View>
  );
}
