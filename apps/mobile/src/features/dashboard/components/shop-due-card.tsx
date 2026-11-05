import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Text, useThemeColors } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import type { RouterOutputs } from '../../../lib/trpc';

// Shop-due card (UX-04 §4, T-04.2/T-04.4): unticked shopping-list lines
// used by tomorrow's planned meals. Hidden when there's nothing due
// (dashboard.summary already returns null in that case).

type ShopDue = NonNullable<RouterOutputs['dashboard']['summary']['shopDue']>;

export function ShopDueCard({ shopDue }: { shopDue: ShopDue }) {
  const colors = useThemeColors();
  const { t } = useT();
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
          <Ionicons name="cart-outline" size={18} color={colors.brand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-label">
            {t('today.home.shopDue.title', { count: shopDue.count })}
          </Text>
          <Text numberOfLines={1} variant="muted" className="text-xs">
            {more > 0 ? t('today.home.shopDue.sampleMore', { sample, more }) : sample}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-primary">
          {t('today.home.shopDue.openList')}
        </Text>
      </Card>
    </Pressable>
  );
}
