import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DisplayCurrency } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { cn, formatMoney } from '@chefer/utils';
import { AiConsentHost } from '../ai-consent/ai-consent-provider';

// Week summary sheet — opened by tapping the week label on the Plan tab.
// Day-level stays on the screen; WEEK-level lives here: per-day overview,
// estimated cost, Regenerate Week (+ leftovers toggle) and My Weeks. Built on
// the shared Sheet (animated enter/exit, MO-02); week actions sit in its footer.
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
  /** Display currency for the EUR cost estimate (P2-6); EUR when omitted. */
  currency?: DisplayCurrency;
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
  currency = 'EUR',
}: WeekSummarySheetProps) {
  const weekKcal = days.reduce((sum, d) => sum + d.totalKcal, 0);
  const plannedDays = days.filter((d) => d.mealsCount > 0).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={badge}
      title={weekLabel}
      testID="week-summary"
      footer={
        isPast ? undefined : (
          <View className="gap-2">
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
              My Weeks — save & reuse weeks
            </Button>
          </View>
        )
      }
    >
      {/* Week stats */}
      <View className="flex-row flex-wrap gap-2">
        <View className="rounded-full bg-gray-100 px-3 py-1">
          <Text className="text-xs font-medium text-gray-600">{plannedDays}/7 days planned</Text>
        </View>
        {weekKcal > 0 && (
          <View className="rounded-full bg-gray-100 px-3 py-1">
            <Text className="text-xs font-medium text-gray-600">
              ~{Math.round(weekKcal / Math.max(plannedDays, 1))} kcal/day
            </Text>
          </View>
        )}
        {weekCostEur !== null && (
          <View className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
            <Text className="text-xs font-medium text-emerald-700">
              ≈ {formatMoney(weekCostEur, currency)} this week
            </Text>
          </View>
        )}
      </View>

      {/* Per-day overview — tap a day to jump to it */}
      <View className="gap-1">
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
      {/* Its AI action's consent sheet nests here (iOS can't stack root Modals). */}
      <AiConsentHost />
    </Sheet>
  );
}
