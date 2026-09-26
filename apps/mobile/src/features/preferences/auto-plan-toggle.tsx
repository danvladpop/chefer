import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';

// "Plan my week every Sunday" (audit F-PLAN-4-3) — mobile counterpart of web
// features/preferences/auto-plan-toggle. Premium only (the caller gates it).

export function AutoPlanToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);
  const utils = trpc.useUtils();
  const mutation = trpc.preferences.setAutoPlanWeekly.useMutation({
    onSuccess: (res) => {
      setEnabled(res.autoPlanWeekly);
      void utils.preferences.get.invalidate();
    },
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  return (
    <Card testID="prefs-auto-plan" className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="heading">Plan my week every Sunday</Text>
          <Text variant="muted" className="mt-1 text-sm">
            Your chef prepares next week on Sunday morning. If you follow a saved week in My weeks,
            that week repeats instead.
          </Text>
        </View>
        <Switch
          testID="prefs-auto-plan-switch"
          accessibilityLabel="Plan my week every Sunday"
          value={enabled}
          disabled={mutation.isPending}
          onValueChange={(next) => {
            setEnabled(next);
            mutation.mutate({ enabled: next });
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
