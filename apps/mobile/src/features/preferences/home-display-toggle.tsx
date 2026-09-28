import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';

// "Show calories and macros on Today" (UX-04, T-04.5). An explicit choice
// overrides the goal-derived default (B-31) either way — a goal-having user
// may still prefer a plainer Today, and someone without a goal who just
// wants the numbers can turn it on.

export function HomeDisplayToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);
  const utils = trpc.useUtils();
  const mutation = trpc.preferences.setHomeDisplay.useMutation({
    onSuccess: (res) => {
      setEnabled(res.showNutritionOnToday);
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
    },
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  return (
    <Card testID="prefs-home-display" className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="heading">Show calories and macros on Today</Text>
          <Text variant="muted" className="mt-1 text-sm">
            Off: Today shows your meals and workouts, without numbers.
          </Text>
        </View>
        <Switch
          testID="prefs-home-display-switch"
          accessibilityLabel="Show calories and macros on Today"
          value={enabled}
          disabled={mutation.isPending}
          onValueChange={(next) => {
            setEnabled(next);
            mutation.mutate({ showNutritionOnToday: next });
          }}
          trackColor={{ true: '#944a00', false: '#d1d5db' }}
        />
      </View>
      {mutation.isError && (
        <Text className="text-xs text-red-600">Couldn&apos;t save that. Try again.</Text>
      )}
    </Card>
  );
}
