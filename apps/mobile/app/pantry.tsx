import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useEntitlement } from '../src/hooks/use-entitlement';
import { trpc } from '../src/lib/trpc';

// Pantry — port of apps/web (dashboard)/pantry/page.tsx (M2-6).
// Deviations, deliberate: the weekly "Still have these?" confirm sheet needs
// the Sheet primitive (follow-up); the unit picker is a chip row instead of
// a <select>.

const UNIT_OPTIONS = ['pcs', 'g', 'kg', 'ml', 'l', 'pack', 'can', 'bunch'];

function ageLabel(updatedAt: Date | string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  return `${Math.floor(days / 7)} weeks ago`;
}

export default function PantryScreen() {
  const { enabled, isPremium } = useEntitlement('pantryPlanning');
  const locked = isPremium === false;
  const { data, isLoading } = trpc.pantry.list.useQuery(undefined, { staleTime: 30_000 });
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');

  const invalidate = () => {
    void utils.pantry.list.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
  };
  const addMutation = trpc.pantry.addItem.useMutation({
    onSuccess: () => {
      setName('');
      setQuantity('');
      invalidate();
    },
  });
  const removeMutation = trpc.pantry.removeItem.useMutation({ onSuccess: invalidate });

  const handleAdd = () => {
    if (!name.trim() || addMutation.isPending) {
      return;
    }
    const qty = parseFloat(quantity.replace(',', '.'));
    addMutation.mutate({
      name: name.trim(),
      ...(Number.isFinite(qty) && qty > 0 ? { quantity: qty } : {}),
      unit,
    });
  };

  const items = data?.items ?? [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Your Kitchen
          </Text>
          <Text testID="pantry-title" variant="title">
            Pantry
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <Text variant="muted" className="text-sm">
          Checked-off shopping list items land here automatically. The longest-sitting items are
          used first in your plans.
        </Text>

        {/* Free-tier upsell — page stays visible read-only (§6.4) */}
        {locked && (
          <Card testID="pantry-upsell" className="border-amber-200 bg-amber-50">
            <Text className="text-sm font-semibold text-gray-900">
              Chefer sees your kitchen — premium cooks from it.
            </Text>
            <Text className="mt-1 text-sm text-gray-700">
              Premium plans use these items up before they go to waste, subtract them from your
              shopping list, and show what you saved each week. Upgrade from your Profile.
            </Text>
          </Card>
        )}

        {/* Manual add (premium) */}
        {enabled && (
          <View className="gap-2">
            <View className="flex-row gap-2">
              <TextInput
                testID="pantry-add-name"
                value={name}
                onChangeText={setName}
                onSubmitEditing={handleAdd}
                placeholder="Add something you have… e.g. rice"
                placeholderTextColor="#9ca3af"
                editable={!addMutation.isPending}
                className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
              <TextInput
                testID="pantry-add-qty"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="Qty"
                placeholderTextColor="#9ca3af"
                editable={!addMutation.isPending}
                className="h-11 w-16 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
              />
            </View>
            <View className="flex-row items-center gap-1.5">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-1.5"
              >
                {UNIT_OPTIONS.map((u) => (
                  <Pressable
                    key={u}
                    accessibilityRole="button"
                    onPress={() => setUnit(u)}
                    className={cn(
                      'h-9 items-center justify-center rounded-full border px-3',
                      unit === u ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-xs font-medium',
                        unit === u ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {u}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                testID="pantry-add-submit"
                accessibilityRole="button"
                accessibilityLabel="Add to pantry"
                disabled={!name.trim() || addMutation.isPending}
                onPress={handleAdd}
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-md bg-primary',
                  (!name.trim() || addMutation.isPending) && 'opacity-40',
                )}
              >
                <Ionicons name="add" size={22} color="white" />
              </Pressable>
            </View>
            {addMutation.isError && (
              <Text className="text-xs text-red-600">{addMutation.error.message}</Text>
            )}
          </View>
        )}

        {/* Item list */}
        {isLoading ? (
          <ActivityIndicator color="#944a00" />
        ) : items.length === 0 ? (
          <Card testID="pantry-empty" className="items-center border-dashed py-10">
            <Ionicons name="file-tray-stacked-outline" size={36} color="#d1d5db" />
            <Text variant="muted" className="mt-3 px-6 text-center text-sm">
              Check items off your shopping list while you shop — everything you buy lands here.
            </Text>
          </Card>
        ) : (
          <View className="gap-2">
            {items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                    {item.ingredientName}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {item.quantity != null ? `${item.quantity} ${item.unit}` : 'some left'} ·{' '}
                    {item.source === 'PURCHASE' ? 'bought' : 'added'} {ageLabel(item.updatedAt)}
                  </Text>
                </View>
                {enabled && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.ingredientName} from your kitchen`}
                    disabled={removeMutation.isPending}
                    onPress={() => removeMutation.mutate({ id: item.id })}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
