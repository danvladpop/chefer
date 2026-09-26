import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { DisplayCurrency } from '@chefer/types';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { formatMoney } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// Pantry ghost state (F3, §6.4) — port of web's
// features/pantry/components/PantryGhostBanner.tsx. Free tier, after any
// check-off session: the check-offs REALLY seeded pantry items, so both
// numbers are real — "You now have N items in your kitchen" + "this week
// that would have saved ~€X" (the list items the pantry covers). Shown on
// Shop → To buy (as on web) and Shop → In my kitchen.

export function PantryGhostBanner({
  savedEur,
  currency = 'EUR',
}: {
  savedEur: number;
  /** Display currency — savedEur is converted for display (P2-6). */
  currency?: DisplayCurrency;
}) {
  // Live count (pantry.list is invalidated after every check-off) so the
  // banner appears mid-session, right after the first items are seeded.
  const { data } = trpc.pantry.list.useQuery(undefined, { staleTime: 15_000 });
  const itemCount = data?.count ?? 0;
  if (itemCount === 0) {
    return null;
  }

  return (
    <Card testID="pantry-ghost" className="border-amber-200 bg-amber-50">
      <View className="flex-row items-start gap-3">
        <Ionicons name="file-tray-stacked-outline" size={20} color="#944a00" />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-gray-900">
            You now have {itemCount} item{itemCount !== 1 ? 's' : ''} in your kitchen — premium
            plans cook from them.
          </Text>
          <Text testID="pantry-ghost-saved" className="text-sm text-gray-700">
            {savedEur > 0
              ? `This week that would have saved ~${formatMoney(savedEur, currency)} off this list.`
              : 'Premium plans use them up before they go to waste — and subtract them from this list.'}
          </Text>
          <Button
            testID="pantry-ghost-upgrade"
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onPress={() => router.push({ pathname: '/profile', params: { source: 'pantry' } })}
          >
            See Premium
          </Button>
        </View>
      </View>
    </Card>
  );
}
