import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, Text } from '@chefer/ui-mobile';
import { joinDayNames, weekdayShortName, withoutKcalLines } from '@chefer/utils';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// ─── What Premium changed (UX-10 §8, T-10.7) ───────────────────────────────────
// One-time card above the day view, straight after a premium regeneration. The
// lines are the server's (`premiumChanges.lines`, honest by construction); a
// day the week missed is stated, with a `Fix it` that opens the PlanMissSheet.

export type PremiumChanges = {
  lines: string[];
  targetHits: number;
  missDays: number;
  misses?: { dayOfWeek: number; deltaKcal: number }[] | undefined;
};

/** "Tue and Thu are about 320 kcal under" — null when nothing missed. */
export function missLine(
  misses: readonly { dayOfWeek: number; deltaKcal: number }[],
): string | null {
  if (misses.length === 0) return null;
  const names = joinDayNames(misses.map((m) => weekdayShortName(m.dayOfWeek)));
  const avg =
    Math.round(misses.reduce((sum, m) => sum + Math.abs(m.deltaKcal), 0) / misses.length / 10) * 10;
  const direction = misses.every((m) => m.deltaKcal > 0)
    ? 'over'
    : misses.every((m) => m.deltaKcal < 0)
      ? 'under'
      : 'off target';
  const verb = misses.length === 1 ? 'is' : 'are';
  return direction === 'off target'
    ? `${names} ${verb} about ${avg} kcal off target`
    : `${names} ${verb} about ${avg} kcal ${direction}`;
}

export function PremiumChangesCard({
  changes,
  hasPrevious,
  onFixIt,
  onCompare,
  onDismiss,
}: {
  changes: PremiumChanges;
  /** A free week to compare with exists (`previousPlanId`). */
  hasPrevious: boolean;
  /** The first missed day's index. */
  onFixIt: (dayOfWeek: number) => void;
  onCompare: () => void;
  onDismiss: () => void;
}) {
  // WP-08: protein-only mode drops the server's calorie lines and the calorie-miss line (and its Fix it).
  const { proteinOnly } = useNumbersMode();
  const misses = proteinOnly ? [] : (changes.misses ?? []);
  const lines = proteinOnly
    ? changes.lines.filter((line) => withoutKcalLines(line) !== '')
    : changes.lines;
  const miss = missLine(misses);
  const firstMiss = misses[0];
  return (
    <Card testID="premium-changes-card" className="gap-2 border-primary/20 bg-accent">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="heading" className="min-w-0 flex-1 text-base">
          What Premium changed
        </Text>
        <Pressable
          testID="premium-changes-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="close" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View className="gap-1">
        {lines.map((line) => (
          <View key={line} className="flex-row items-start gap-2">
            <Text className="text-sm text-primary">•</Text>
            <Text className="min-w-0 flex-1 text-sm text-gray-700">{line}</Text>
          </View>
        ))}
        {miss !== null && (
          <View className="flex-row items-start gap-2">
            <Text className="text-sm text-primary">•</Text>
            <Text testID="premium-changes-miss" className="min-w-0 flex-1 text-sm text-gray-700">
              {miss}
            </Text>
          </View>
        )}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {firstMiss && (
          <Button
            testID="premium-changes-fix"
            variant="outline"
            size="sm"
            onPress={() => onFixIt(firstMiss.dayOfWeek)}
          >
            Fix it
          </Button>
        )}
        {hasPrevious && (
          <Button testID="premium-changes-compare" variant="outline" size="sm" onPress={onCompare}>
            Compare with your free week
          </Button>
        )}
      </View>
    </Card>
  );
}
