import { Pressable, Share, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DayKind, DisplayCurrency } from '@chefer/types';
import { Button, colors, DENSE_MAX_FONT_SCALE, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  cn,
  formatDinnersForSharing,
  formatMoney,
  trainingDaysChip,
  trainingGlyph,
  type ShareDinner,
} from '@chefer/utils';
import { getWebUrl } from '../../lib/api-url';
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
  /** T-06.4: a training day — its glyph and workout name show on the row. */
  training?: { kind: DayKind; workoutName: string | null } | undefined;
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
  /** T-13.2: the week's planned dinners for `Share this week’s dinners`. */
  dinners?: readonly ShareDinner[];
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
  dinners = [],
}: WeekSummarySheetProps) {
  const { show: showSnackbar } = useSnackbar();
  const trainingChip = trainingDaysChip(days.filter((d) => d.training).length);

  // T-13.2: plain text through the OS share sheet — not an AI call, so no
  // consent. The snackbar only follows an actual share, not a dismissed sheet.
  const shareDinners = async () => {
    if (dinners.length === 0) return;
    try {
      const result = await Share.share({
        message: formatDinnersForSharing(dinners, getWebUrl('/')),
      });
      if (result.action !== Share.dismissedAction) {
        showSnackbar({ message: 'List ready to send.', tone: 'success' });
      }
    } catch {
      // The OS share sheet failed to open: nothing was sent, nothing to report.
    }
  };

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
        {trainingChip !== null && (
          <View testID="week-summary-training-chip" className="rounded-full bg-accent px-3 py-1">
            <Text className="text-xs font-medium text-primary">{trainingChip}</Text>
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
            <View className="min-w-0 flex-shrink flex-row items-center gap-2">
              {/* T-21.13 (bug CI-43): the 3-letter day label is capped at
                  DENSE_MAX_FONT_SCALE so it never wraps or overflows its
                  fixed-width column at large accessibility text sizes,
                  while the rest of the sheet scales normally. */}
              <Text
                className={cn(
                  'w-10 text-xs font-semibold uppercase',
                  d.isToday ? 'text-primary' : 'text-gray-600',
                )}
                maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              >
                {d.label}
              </Text>
              <Text variant="muted" className="text-xs">
                {d.mealsCount === 0 ? 'no meals' : `${d.mealsCount} meals`}
              </Text>
              {d.training && (
                <View
                  testID={`week-summary-training-${d.dayIndex}`}
                  className="min-w-0 flex-shrink flex-row items-center gap-1"
                >
                  <Ionicons
                    name={trainingGlyph(d.training.kind)}
                    size={12}
                    color={colors.primary}
                  />
                  {d.training.workoutName ? (
                    <Text numberOfLines={1} className="min-w-0 flex-shrink text-xs text-primary">
                      {d.training.workoutName}
                    </Text>
                  ) : null}
                </View>
              )}
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
      <Button
        testID="week-summary-share-dinners"
        variant="outline"
        disabled={dinners.length === 0}
        onPress={() => void shareDinners()}
      >
        Share this week’s dinners
      </Button>
      {/* Its AI action's consent sheet nests here (iOS can't stack root Modals). */}
      <AiConsentHost />
    </Sheet>
  );
}
