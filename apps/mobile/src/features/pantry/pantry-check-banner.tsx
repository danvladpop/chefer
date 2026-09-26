import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@chefer/ui-mobile';
import {
  cn,
  PANTRY_CONFIRM_MIN_AGE_DAYS,
  pantryConfirmWeekKey,
  pantryItemsToConfirm,
} from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trpc } from '../../lib/trpc';
import { kv } from '../gym/offline/kv';

// "Still have these?" — inline pantry check (F3, audit F-PM-13). Mobile twin
// of web's PantryCheckBanner: an inline card at the top of Shop (never a
// sheet over the list), asked at most once a week and only about items that
// have been in the kitchen 3+ days. "Not now" counts as answered for the week.
// The answered week lives in the app's KV store (expo-sqlite, already in the
// binary); tapped items are cleared via pantry.confirmWeekly.

export const PANTRY_CHECK_KV_KEY = 'chefer.pantry-check-week';

interface PantryCheckBannerProps {
  /** Opened by hand ("Still have these?"): shows even if answered this week. */
  manualOpen?: boolean;
  onManualClose?: () => void;
}

export function PantryCheckBanner({ manualOpen = false, onManualClose }: PantryCheckBannerProps) {
  const { enabled } = useEntitlement('pantryPlanning');
  const { data } = trpc.pantry.list.useQuery(undefined, { enabled, staleTime: 60_000 });
  const [answeredWeek, setAnsweredWeek] = useState<string | null>(() =>
    kv.getString(PANTRY_CHECK_KV_KEY),
  );
  const [expanded, setExpanded] = useState(false);
  const [clearIds, setClearIds] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const weekKey = pantryConfirmWeekKey();
  const candidates = pantryItemsToConfirm(data?.items ?? []);
  const autoDue = enabled && candidates.length > 0 && answeredWeek !== weekKey;
  const open = enabled && (manualOpen || autoDue);
  const showItems = manualOpen || expanded;

  const close = () => {
    kv.setString(PANTRY_CHECK_KV_KEY, weekKey);
    setAnsweredWeek(weekKey);
    setExpanded(false);
    setClearIds(new Set());
    onManualClose?.();
  };

  const confirmMutation = trpc.pantry.confirmWeekly.useMutation({
    onSuccess: () => {
      void utils.pantry.list.invalidate();
      void utils.shoppingList.getForWeek.invalidate();
      close();
    },
  });

  if (!open || !data) {
    return null;
  }

  const toggle = (id: string) => {
    setClearIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Card testID="pantry-check-banner" className="gap-3 border-emerald-200 bg-emerald-50">
      <View className="flex-row items-start gap-3">
        <Ionicons name="clipboard-outline" size={20} color="#047857" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-emerald-900">Still have these?</Text>
          <Text className="mt-0.5 text-xs text-emerald-800">
            {candidates.length === 0
              ? `Everything in your kitchen was added in the last ${PANTRY_CONFIRM_MIN_AGE_DAYS} days — nothing to check yet.`
              : showItems
                ? "Tap anything you've used up. Everything else stays in your kitchen."
                : `${candidates.length} item${candidates.length === 1 ? ' has' : 's have'} been in your kitchen for a few days.`}
          </Text>
        </View>
        <Pressable
          testID="pantry-check-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Not now"
          onPress={close}
          className="-m-2 h-11 w-11 items-center justify-center"
        >
          <Ionicons name="close" size={18} color="#065f46" />
        </Pressable>
      </View>

      {candidates.length > 0 && !showItems && (
        <View className="flex-row gap-2">
          <Button testID="pantry-check-review" className="flex-1" onPress={() => setExpanded(true)}>
            Check them
          </Button>
          <Button variant="ghost" className="flex-1" onPress={close}>
            Not now
          </Button>
        </View>
      )}

      {candidates.length > 0 && showItems && (
        <>
          <View className="flex-row flex-wrap gap-2">
            {candidates.map((item) => {
              const cleared = clearIds.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  testID={`pantry-check-item-${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cleared }}
                  accessibilityLabel={`${item.ingredientName}: ${cleared ? 'used up' : 'still have it'}`}
                  onPress={() => toggle(item.id)}
                  className={cn(
                    'min-h-11 max-w-full flex-row items-center gap-1.5 rounded-full border px-3',
                    cleared ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-white',
                  )}
                >
                  <Ionicons
                    name={cleared ? 'close' : 'checkmark'}
                    size={14}
                    color={cleared ? '#b91c1c' : '#059669'}
                  />
                  <Text
                    numberOfLines={1}
                    className={cn(
                      'shrink text-sm capitalize',
                      cleared ? 'text-red-700 line-through' : 'text-gray-800',
                    )}
                  >
                    {item.ingredientName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            testID="pantry-check-done"
            loading={confirmMutation.isPending}
            onPress={() => confirmMutation.mutate({ clearIds: [...clearIds] })}
          >
            {clearIds.size > 0
              ? `Done — clear ${clearIds.size} item${clearIds.size !== 1 ? 's' : ''}`
              : 'Done — I still have everything'}
          </Button>
          {confirmMutation.isError && (
            <Text className="text-xs text-red-600">{confirmMutation.error.message}</Text>
          )}
        </>
      )}
    </Card>
  );
}
