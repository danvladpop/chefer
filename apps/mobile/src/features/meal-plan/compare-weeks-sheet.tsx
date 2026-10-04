import { ActivityIndicator, View } from 'react-native';
import { Sheet, Text } from '@chefer/ui-mobile';
import { formatKcal, sumPlanDay, weekdayLongName } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// The compare sheet behind `What Premium changed`: the free week the
// regeneration replaced next to the new one, day by day — kcal and protein
// from the recipes' nutrition at each slot's portion (the same `sumPlanDay`
// the Plan day totals use).

type WeekLike = {
  days: { dayOfWeek: number; meals: Parameters<typeof sumPlanDay>[0] }[];
};

export type CompareRow = {
  dayOfWeek: number;
  before: { kcal: number; protein: number } | null;
  after: { kcal: number; protein: number } | null;
};

export function compareRows(before: WeekLike | null | undefined, after: WeekLike): CompareRow[] {
  const totals = (week: WeekLike | null | undefined, dayOfWeek: number) => {
    const meals = week?.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ?? [];
    if (meals.length === 0) return null;
    const t = sumPlanDay(meals);
    return { kcal: t.kcal, protein: t.protein };
  };
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    before: totals(before, dayOfWeek),
    after: totals(after, dayOfWeek),
  })).filter((r) => r.before !== null || r.after !== null);
}

const cell = (t: { kcal: number; protein: number } | null, proteinOnly = false): string => {
  if (!t) return '—';
  // WP-08: protein-only mode compares protein alone.
  return proteinOnly ? `${t.protein} g protein` : `${formatKcal(t.kcal)} kcal · ${t.protein} g`;
};

export function CompareWeeksSheet({
  visible,
  onClose,
  previousPlanId,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  previousPlanId: string | undefined;
  current: WeekLike;
}) {
  const { proteinOnly } = useNumbersMode();
  const { data, isLoading, isError } = trpc.mealPlan.getById.useQuery(
    { planId: previousPlanId ?? '' },
    { enabled: visible && !!previousPlanId, retry: false },
  );
  const rows = data ? compareRows(data, current) : [];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="Compare"
      title="Your free week and this week"
      testID="compare-weeks-sheet"
    >
      {!previousPlanId || isError || (!isLoading && !data) ? (
        <Text testID="compare-weeks-missing" variant="muted" className="text-sm">
          Your free week isn’t available to compare any more.
        </Text>
      ) : isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : (
        <View className="gap-2 pb-2">
          <View className="flex-row gap-2">
            <Text className="w-20 text-xs font-semibold uppercase text-gray-500">Day</Text>
            <Text className="min-w-0 flex-1 text-xs font-semibold uppercase text-gray-500">
              Free week
            </Text>
            <Text className="min-w-0 flex-1 text-xs font-semibold uppercase text-gray-500">
              This week
            </Text>
          </View>
          {rows.map((r) => (
            <View
              key={r.dayOfWeek}
              testID={`compare-weeks-row-${r.dayOfWeek}`}
              className="min-h-11 flex-row items-center gap-2 border-t border-border py-1.5"
            >
              <Text className="w-20 text-sm font-medium text-gray-700">
                {weekdayLongName(r.dayOfWeek).slice(0, 3)}
              </Text>
              <Text className="min-w-0 flex-1 text-xs text-gray-600">
                {cell(r.before, proteinOnly)}
              </Text>
              <Text className="min-w-0 flex-1 text-xs text-gray-900">
                {cell(r.after, proteinOnly)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
