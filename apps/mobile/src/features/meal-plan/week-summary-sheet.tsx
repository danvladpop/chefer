import { Modal, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// Week summary sheet — opened by tapping the week label on the Plan tab.
// Day-level stays on the screen; WEEK-level lives here: per-day overview,
// estimated cost, Regenerate Week (+ leftovers toggle) and My Weeks.
export interface DaySummary {
  label: string;
  dayIndex: number;
  mealsCount: number;
  totalKcal: number;
  isToday: boolean;
}

interface WeekSummarySheetProps {
  visible: boolean;
  weekLabel: string;
  badge: string;
  days: DaySummary[];
  weekCostEur: number | null;
  isPast: boolean;
  isPremium: boolean;
  leftovers: boolean;
  onToggleLeftovers: (value: boolean) => void;
  regenerating: boolean;
  onRegenerate: () => void;
  onMyWeeks: () => void;
  onSelectDay: (dayIndex: number) => void;
  onClose: () => void;
}

export function WeekSummarySheet({
  visible,
  weekLabel,
  badge,
  days,
  weekCostEur,
  isPast,
  isPremium,
  leftovers,
  onToggleLeftovers,
  regenerating,
  onRegenerate,
  onMyWeeks,
  onSelectDay,
  onClose,
}: WeekSummarySheetProps) {
  const weekKcal = days.reduce((sum, d) => sum + d.totalKcal, 0);
  const plannedDays = days.filter((d) => d.mealsCount > 0).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close week summary"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="rounded-t-3xl bg-card pb-8" style={{ maxHeight: '85%' }}>
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-gray-300" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between gap-3 px-4 pb-1 pt-3">
            <View className="min-w-0 flex-1">
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                {badge}
              </Text>
              <Text testID="week-summary-title" className="text-base font-semibold">
                {weekLabel}
              </Text>
            </View>
            <Pressable
              testID="week-summary-close"
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
            >
              <Ionicons name="close" size={20} color="#374151" />
            </Pressable>
          </View>

          {/* Week stats */}
          <View className="flex-row flex-wrap gap-2 px-4 pb-2">
            <View className="rounded-full bg-gray-100 px-3 py-1">
              <Text className="text-[11px] font-medium text-gray-600">
                {plannedDays}/7 days planned
              </Text>
            </View>
            {weekKcal > 0 && (
              <View className="rounded-full bg-gray-100 px-3 py-1">
                <Text className="text-[11px] font-medium text-gray-600">
                  ~{Math.round(weekKcal / Math.max(plannedDays, 1))} kcal/day
                </Text>
              </View>
            )}
            {weekCostEur !== null && (
              <View className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                <Text className="text-[11px] font-medium text-emerald-700">
                  ≈ €{weekCostEur.toFixed(2)} this week
                </Text>
              </View>
            )}
          </View>

          {/* Per-day overview — tap a day to jump to it */}
          <View className="gap-1 px-4 py-1">
            {days.map((d) => (
              <Pressable
                key={d.label}
                testID={`week-summary-day-${d.dayIndex}`}
                accessibilityRole="button"
                accessibilityLabel={`View ${d.label}`}
                onPress={() => onSelectDay(d.dayIndex)}
                className={cn(
                  'min-h-11 flex-row items-center justify-between rounded-xl px-3 py-1.5',
                  d.isToday ? 'bg-accent' : 'bg-gray-50',
                )}
              >
                <View className="flex-row items-center gap-2">
                  <Text
                    className={cn(
                      'w-10 text-xs font-semibold uppercase',
                      d.isToday ? 'text-primary' : 'text-gray-600',
                    )}
                  >
                    {d.label}
                  </Text>
                  <Text variant="muted" className="text-xs">
                    {d.mealsCount === 0 ? 'no meals' : `${d.mealsCount} meals`}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  {d.totalKcal > 0 && (
                    <Text variant="muted" className="text-xs">
                      {d.totalKcal} kcal
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
                </View>
              </Pressable>
            ))}
          </View>

          {/* Week actions */}
          {!isPast && (
            <View className="gap-2 border-t border-border px-4 pt-3">
              {isPremium && (
                <View className="flex-row items-center gap-2">
                  <Switch value={leftovers} onValueChange={onToggleLeftovers} />
                  <Text variant="muted" className="text-xs">
                    Cook once, eat twice (leftover lunches)
                  </Text>
                </View>
              )}
              <Button
                testID="plan-regenerate"
                variant="outline"
                loading={regenerating}
                onPress={onRegenerate}
              >
                Regenerate Week
              </Button>
              <Button testID="plan-my-weeks" variant="ghost" onPress={onMyWeeks}>
                My Weeks — save & rotate plans
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
