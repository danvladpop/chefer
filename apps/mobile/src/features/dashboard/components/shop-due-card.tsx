import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import type { RouterOutputs } from '../../../lib/trpc';

// Shop-due card (UX-04 §4, T-04.2/T-04.4): unticked shopping-list lines
// used by tomorrow's planned meals. Hidden when there's nothing due
// (dashboard.summary already returns null in that case).

type ShopDue = NonNullable<RouterOutputs['dashboard']['summary']['shopDue']>;

export function ShopDueCard({ shopDue }: { shopDue: ShopDue }) {
  const sample = shopDue.sample.join(', ');
  const more = shopDue.count - shopDue.sample.length;

  return (
    <Pressable
      testID="shop-due-card"
      accessibilityRole="button"
      onPress={() => router.push('/(food)/shopping-list')}
    >
      <Card className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
          <Ionicons name="cart-outline" size={18} color="#944a00" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-gray-900">
            {shopDue.count} thing{shopDue.count === 1 ? '' : 's'} to buy for tomorrow
          </Text>
          <Text numberOfLines={1} variant="muted" className="text-xs">
            {sample}
            {more > 0 ? ` and ${more} more` : ''}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-primary">Open list</Text>
      </Card>
    </Pressable>
  );
}
