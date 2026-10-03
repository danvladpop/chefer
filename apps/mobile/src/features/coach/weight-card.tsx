import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import { cn, formatBodyWeight } from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';
import { WeightEntriesList } from './weight-entries-list';
import { WeightLogForm } from './weight-log-form';
import { WeightSparkline } from './weight-sparkline';

// Port of web features/coach/WeightCard (wave-2b). The recharts sparkline is a
// react-native-svg line with its start and end values (UX-FOOD-27). The full
// 90-day chart lives on /progress.

export function WeightCard() {
  const [showEntries, setShowEntries] = useState(false);
  // Stored in kg; shown in the user's unit (backlog P2-6).
  const system = useUnitSystem();

  const { data: history } = trpc.tracker.weightHistory.useQuery(
    { days: 30 },
    { staleTime: 60_000 },
  );

  const entries = history ?? [];
  const latest = entries.at(-1);
  const first = entries.at(0);
  const delta =
    latest != null && first != null && entries.length > 1 ? latest.weightKg - first.weightKg : null;

  return (
    <Card testID="weight-card">
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="scale-outline" size={14} color="#10b981" />
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Weight
          </Text>
        </View>
        {latest && (
          <Text className="text-xs text-gray-500">
            <Text className="text-xs font-semibold text-gray-800">
              {formatBodyWeight(latest.weightKg, system)}
            </Text>
            {delta != null && Math.abs(delta) >= 0.05 && (
              <Text className={cn('text-xs', delta < 0 ? 'text-emerald-600' : 'text-gray-500')}>
                {' '}
                ({formatBodyWeight(delta, system, { signed: true })} / 30d)
              </Text>
            )}
          </Text>
        )}
      </View>

      {/* UX-FOOD-27: 30-day line with its start and end values. */}
      {entries.length > 1 && <WeightSparkline entries={entries} system={system} />}

      {/* Shared parser (audit F-DASH-3-1) lives in the form. */}
      <WeightLogForm
        {...(latest && { placeholder: `Today: ${formatBodyWeight(latest.weightKg, system)}?` })}
      />
      <View className="mt-1 flex-row items-center justify-between">
        {entries.length > 0 ? (
          <Pressable
            testID="weight-entries-toggle"
            accessibilityRole="button"
            onPress={() => setShowEntries((v) => !v)}
            className="min-h-11 justify-center"
          >
            <Text className="text-xs font-medium text-primary">
              {showEntries ? 'Hide entries' : 'Edit or delete entries'}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          testID="weight-see-progress"
          accessibilityRole="link"
          onPress={() => router.push('/progress')}
          className="min-h-11 flex-row items-center gap-0.5 pl-3"
        >
          <Text className="text-xs font-medium text-primary">See progress</Text>
          <Ionicons name="chevron-forward" size={12} color="#944a00" />
        </Pressable>
      </View>
      {showEntries && <WeightEntriesList entries={entries} />}
    </Card>
  );
}
