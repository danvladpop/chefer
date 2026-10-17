import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';
import { BoardCard } from '../shell/today/parts';

// "Plan my week every Sunday" (audit F-PLAN-4-3) — mobile counterpart of web
// features/preferences/auto-plan-toggle. Every tier since P2-5: premium gets
// a week the chef learned from their ratings, free a fresh curated week.

export function AutoPlanToggle({
  initialEnabled,
  isPremium = true,
}: {
  initialEnabled: boolean;
  isPremium?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const mutation = trpc.preferences.setAutoPlanWeekly.useMutation({
    onSuccess: (res) => {
      setEnabled(res.autoPlanWeekly);
      void utils.preferences.get.invalidate();
    },
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  return (
    <BoardCard testID="prefs-auto-plan">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            Plan my week every Sunday
          </Text>
          <Text className="mt-1 text-subhead text-label-secondary">
            {isPremium
              ? 'Your chef prepares next week on Sunday morning, learning from what you rate.'
              : 'We pick a fresh week of recipes for you on Sunday morning, matched to your allergies and targets.'}{' '}
            If you follow a saved week in My weeks, that week repeats instead.
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
          trackColor={{ true: colors.brand, false: colors.separator }}
        />
      </View>
      {mutation.isError && (
        <Text className="text-caption text-danger">Couldn&apos;t save that. Try again.</Text>
      )}
    </BoardCard>
  );
}
