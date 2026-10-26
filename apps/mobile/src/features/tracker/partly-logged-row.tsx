import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { PARTLY_LOGGED_COPY } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';

// ─── "Partly logged day" (market review 2026-10, lane D2) ────────────────────
// One switch under a day's log: the day still counts as logged, but the
// Sunday review leaves it out of its averages, so a half-logged day can't
// make the coach think the user ate less than they did. Optimistic; a failed
// save flips back and says so.

export function PartlyLoggedRow({ date, incomplete }: { date: string; incomplete: boolean }) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const mutation = trpc.tracker.setDayIncomplete.useMutation({
    onSuccess: (result) => {
      track('day_incomplete_set', { incomplete: result.incomplete });
      // Write the answer into the cached day first, so the switch doesn't
      // flick back while the refetch is in flight.
      utils.tracker.getDay.setData({ date }, (day) =>
        day ? { ...day, incomplete: result.incomplete } : day,
      );
      void utils.tracker.getDay.invalidate({ date });
    },
    onSettled: () => setOptimistic(null),
  });
  const value = optimistic ?? incomplete;

  return (
    <View testID="tracker-partly-logged" className="min-h-11 flex-row items-center gap-3 py-2">
      <View className="min-w-0 flex-1">
        <Text className="text-body text-label">{PARTLY_LOGGED_COPY.label}</Text>
        <Text className="mt-0.5 text-subhead text-label-secondary">
          {mutation.isError ? PARTLY_LOGGED_COPY.saveError : PARTLY_LOGGED_COPY.detail}
        </Text>
      </View>
      <Switch
        testID="tracker-partly-logged-switch"
        accessibilityRole="switch"
        accessibilityLabel={PARTLY_LOGGED_COPY.label}
        accessibilityHint={PARTLY_LOGGED_COPY.detail}
        accessibilityState={{ checked: value }}
        value={value}
        disabled={mutation.isPending}
        onValueChange={(on) => {
          setOptimistic(on);
          mutation.mutate({ date, incomplete: on });
        }}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}
