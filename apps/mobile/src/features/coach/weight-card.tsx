import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// Port of web features/coach/WeightCard (wave-2b). Deviation: the recharts
// sparkline becomes a View-based bar sparkline — no chart library needed for
// an axis-free 30-day trend.

export function WeightCard() {
  const [weightInput, setWeightInput] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  const { data: history, refetch } = trpc.tracker.weightHistory.useQuery(
    { days: 30 },
    { staleTime: 60_000 },
  );

  const logWeightMutation = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setWeightSaved(true);
      setWeightInput('');
      setTimeout(() => setWeightSaved(false), 3000);
      void refetch();
    },
  });

  const entries = history ?? [];
  const latest = entries.at(-1);
  const first = entries.at(0);
  const delta =
    latest != null && first != null && entries.length > 1 ? latest.weightKg - first.weightKg : null;

  const min = Math.min(...entries.map((e) => e.weightKg));
  const max = Math.max(...entries.map((e) => e.weightKg));
  const range = Math.max(max - min, 0.1);

  const submit = () => {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (Number.isFinite(kg) && kg > 20 && kg < 500 && !logWeightMutation.isPending) {
      logWeightMutation.mutate({ weightKg: Math.round(kg * 10) / 10 });
    }
  };

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

      <View className="flex-row gap-2">
        <TextInput
          testID="weight-input"
          value={weightInput}
          onChangeText={setWeightInput}
          onSubmitEditing={submit}
          keyboardType="decimal-pad"
          placeholder={latest ? `Today: ${latest.weightKg} kg?` : 'Log today’s weight (kg)'}
          placeholderTextColor="#9ca3af"
          className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
        />
        <Pressable
          testID="weight-save"
          accessibilityRole="button"
          accessibilityLabel="Log weight"
          disabled={logWeightMutation.isPending || !weightInput.trim()}
          onPress={submit}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-md bg-primary',
            (logWeightMutation.isPending || !weightInput.trim()) && 'opacity-40',
          )}
        >
          <Ionicons name={weightSaved ? 'checkmark' : 'add'} size={20} color="white" />
        </Pressable>
      </View>
      {logWeightMutation.isError && (
        <Text className="mt-1 text-xs text-red-600">{logWeightMutation.error.message}</Text>
      )}
    </Card>
  );
}
