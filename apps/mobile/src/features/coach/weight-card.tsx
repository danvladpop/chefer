import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { WeightEntriesList } from './weight-entries-list';
import { WeightLogForm } from './weight-log-form';

// Port of web features/coach/WeightCard (wave-2b). Deviation: the recharts
// sparkline becomes a View-based bar sparkline — no chart library needed for
// an axis-free 30-day trend. The full 90-day chart lives on /progress.

export function WeightCard() {
  const [showEntries, setShowEntries] = useState(false);

  const { data: history } = trpc.tracker.weightHistory.useQuery(
    { days: 30 },
    { staleTime: 60_000 },
  );

  const entries = history ?? [];
  const latest = entries.at(-1);
  const first = entries.at(0);
  const delta =
    latest != null && first != null && entries.length > 1 ? latest.weightKg - first.weightKg : null;

  const min = Math.min(...entries.map((e) => e.weightKg));
  const max = Math.max(...entries.map((e) => e.weightKg));
  const range = Math.max(max - min, 0.1);

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
            <Text className="text-xs font-semibold text-gray-800">{latest.weightKg} kg</Text>
            {delta != null && Math.abs(delta) >= 0.05 && (
              <Text className={cn('text-xs', delta < 0 ? 'text-emerald-600' : 'text-gray-500')}>
                {' '}
                ({delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg / 30d)
              </Text>
            )}
          </Text>
        )}
      </View>

      {/* 30-day sparkline — axis-free bars (web uses recharts) */}
      {entries.length > 1 && (
        <View className="mb-3 h-14 flex-row items-end gap-0.5">
          {entries.map((e, i) => (
            <View
              key={i}
              className="flex-1 rounded-t-sm bg-emerald-200"
              style={{ height: `${20 + ((e.weightKg - min) / range) * 80}%` }}
            />
          ))}
        </View>
      )}

      {/* Shared parser (audit F-DASH-3-1) lives in the form. */}
      <WeightLogForm
        placeholder={latest ? `Today: ${latest.weightKg} kg?` : 'Log today’s weight (kg)'}
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
