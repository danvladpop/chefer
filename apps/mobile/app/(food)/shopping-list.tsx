import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { Button, Card, ErrorState, Screen, SegmentedControl, Text } from '@chefer/ui-mobile';
import {
  cn,
  formatMoney,
  formatQuantity,
  isConvertedCurrency,
  perPortionCost,
  shoppingWindowLabel,
} from '@chefer/utils';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { PantryCheckBanner } from '../../src/features/pantry/pantry-check-banner';
import { PantryGhostBanner } from '../../src/features/pantry/pantry-ghost-banner';
import { PantryPanel } from '../../src/features/pantry/pantry-panel';
import { parseCustomItemInput } from '../../src/features/shopping-list/parse-custom-item';
import { useCurrency } from '../../src/hooks/use-currency';
import { useHousehold } from '../../src/hooks/use-household';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { trpc } from '../../src/lib/trpc';

// Shop tab — port of apps/web (dashboard)/shopping-list/page.tsx (M2-5).
// P2-8: "To buy" / "In my kitchen" segments (the pantry moved here from More)
// and the inline weekly "Still have these?" banner (F-PM-13). Deviations,
// deliberate: no print / send-to-mobile (this IS the phone). Free tier: the
// pantry ghost banner (real kitchen count + this week's savings) on both
// segments.

type ShopView = 'list' | 'kitchen';
const SHOP_SEGMENTS = [
  { value: 'list' as const, label: 'To buy', testID: 'shop-segment-list' },
  { value: 'kitchen' as const, label: 'In my kitchen', testID: 'shop-segment-kitchen' },
];

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&h=120&fit=crop&q=80';

const CATEGORY_ORDER = ['produce', 'proteins', 'dairy', 'grains', 'frozen', 'other'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  proteins: 'Proteins',
  dairy: 'Dairy & Eggs',
  grains: 'Grains & Pantry',
  frozen: 'Frozen',
  other: 'Other',
};

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function ShoppingListScreen() {
  // Deep links (/shopping-list?view=kitchen) open the kitchen segment.
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ShopView>(params.view === 'kitchen' ? 'kitchen' : 'list');
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [newItemText, setNewItemText] = useState('');
  const isPremium = useIsPremium();
  const { memberCount } = useHousehold();
  const unitSystem = useUnitSystem();
  // Prices are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = useCurrency();
  const utils = trpc.useUtils();

  const weekStart = getMondayOfWeek(weekOffset);

  const {
    data: weekList,
    isLoading,
    isError,
    refetch: refetchList,
  } = trpc.shoppingList.getForWeek.useQuery({ weekOffset }, { staleTime: 60_000 });

  // Optimistic per-key toggle (P1-5) — same cache surgery as web: flip
  // immediately, per-key server semantics merge concurrent devices.
  const toggleMutation = trpc.shoppingList.toggleItems.useMutation({
    onMutate: async ({ keys, checked }) => {
      await utils.shoppingList.getForWeek.cancel({ weekOffset });
      const previous = utils.shoppingList.getForWeek.getData({ weekOffset });
      utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
        old
          ? {
              ...old,
              checkedKeys: checked
                ? [...new Set([...old.checkedKeys, ...keys])]
                : old.checkedKeys.filter((k) => !keys.includes(k)),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        utils.shoppingList.getForWeek.setData({ weekOffset }, context.previous);
      }
    },
    onSuccess: (_data, vars) => {
      if (vars.checked) {
        void utils.pantry.list.invalidate();
      }
    },
  });

  const addItemMutation = trpc.shoppingList.addCustomItems.useMutation({
    onSuccess: () => {
      setNewItemText('');
      void utils.shoppingList.getForWeek.invalidate({ weekOffset });
    },
  });
  const removeItemMutation = trpc.shoppingList.removeCustomItem.useMutation({
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  const markOutMutation = trpc.pantry.markOutOfStock.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getForWeek.invalidate();
      void utils.pantry.list.invalidate();
    },
  });
  const regenerateMutation = trpc.shoppingList.regenerate.useMutation({
    onSuccess: (data) => {
      utils.shoppingList.getForWeek.setData({ weekOffset }, data);
    },
  });

  const items = weekList?.items ?? [];
  const checkedItems = weekList?.checkedKeys ?? [];
  const checkedCount = checkedItems.filter((key) => items.some((i) => i.key === key)).length;
  const pantry = weekList?.pantry;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !(prev[cat] ?? false) }));
  }, []);

  const toggleItem = (key: string) => {
    if (!weekList?.planId) {
      return;
    }
    toggleMutation.mutate({
      planId: weekList.planId,
      keys: [key],
      checked: !checkedItems.includes(key),
    });
  };

  const handleAddItem = () => {
    const parsed = parseCustomItemInput(newItemText);
    if (!parsed.name || !weekList?.planId || addItemMutation.isPending) {
      return;
    }
    addItemMutation.mutate({ planId: weekList.planId, items: [parsed] });
  };

  const segments = (
    <SegmentedControl
      options={SHOP_SEGMENTS}
      value={view}
      onChange={setView}
      accessibilityLabel="Shop sections"
      testID="shop-segments"
    />
  );

  if (view === 'kitchen') {
    return (
      <Screen className="px-0">
        <ScrollView contentContainerClassName="gap-4 px-4 py-4">
          <ModeSwitch />
          <View>
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Your Kitchen
            </Text>
            <Text testID="shopping-title" variant="title">
              Shop
            </Text>
          </View>
          {segments}
          <PantryPanel savedEur={weekList?.pantry.savedEur ?? 0} currency={currency} />
        </ScrollView>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <ModeSwitch className="mt-3" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      </Screen>
    );
  }

  // A failed load is not an empty list (F-X-3-1).
  if (isError && !weekList) {
    return (
      <Screen>
        <ModeSwitch className="mt-3" />
        <ErrorState
          title="Couldn't load your shopping list"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetchList()}
        />
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <ModeSwitch />
        {segments}
        {/* Header + week navigator */}
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : 'Past Week'}
            </Text>
            <Text testID="shopping-title" variant="title">
              Shop
            </Text>
            <Text variant="muted" className="text-xs">
              Week of {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
              {items.length > 0 ? ` · ${checkedCount}/${items.length} done` : ''}
              {/* A plan made mid-week lists only the remaining days (audit F-PM-3) */}
              {shoppingWindowLabel(weekList?.fromDayOfWeek)
                ? ` · covers ${shoppingWindowLabel(weekList?.fromDayOfWeek)}`
                : ''}
            </Text>
          </View>
          <View className="flex-row gap-1">
            <Pressable
              testID="week-prev"
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              disabled={weekOffset <= -52}
              onPress={() => setWeekOffset((o) => o - 1)}
              className="h-11 w-11 items-center justify-center rounded-full border border-border"
            >
              <Ionicons name="chevron-back" size={18} color="#6b7280" />
            </Pressable>
            <Pressable
              testID="week-next"
              accessibilityRole="button"
              accessibilityLabel="Next week"
              disabled={weekOffset >= 1}
              onPress={() => setWeekOffset((o) => o + 1)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full border border-border',
                weekOffset >= 1 && 'opacity-40',
              )}
            >
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </Pressable>
          </View>
        </View>

        {/* Cost badges */}
        {(weekList?.estimatedTotalEur != null || (pantry?.entitled && pantry.savedEur > 0)) && (
          <View className="flex-row flex-wrap gap-2">
            {weekList?.estimatedTotalEur != null && (
              <View
                className="rounded-full border border-border bg-gray-50 px-3 py-1"
                accessibilityLabel={
                  isConvertedCurrency(currency)
                    ? `Estimated total about ${formatMoney(weekList.estimatedTotalEur, currency)}, converted from euros at an approximate rate`
                    : undefined
                }
              >
                <Text testID="shopping-total" className="text-xs font-medium text-gray-600">
                  Est. total ~{formatMoney(weekList.estimatedTotalEur, currency)}
                </Text>
              </View>
            )}
            {/* Who the quantities are for (P2-3, F-PM-5): a premium
                household's list is scaled to the table. */}
            {weekList?.portions != null && (
              <View className="rounded-full border border-primary/20 bg-accent px-3 py-1">
                <Text testID="shopping-portions" className="text-xs font-medium text-primary">
                  For {weekList.portions} portions
                  {weekList.estimatedTotalEur != null &&
                    ` · ~${formatMoney(
                      perPortionCost(weekList.estimatedTotalEur, weekList.portions) ?? 0,
                      currency,
                    )} each`}
                </Text>
              </View>
            )}
            {weekList?.hasPlan && weekList.portions == null && memberCount > 0 && (
              <View className="rounded-full border border-border bg-gray-50 px-3 py-1">
                <Text testID="shopping-one-portion" className="text-xs font-medium text-gray-600">
                  Sized for 1 portion
                </Text>
              </View>
            )}
            {pantry?.entitled && pantry.savedEur > 0 && (
              <View className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                <Text className="text-xs font-medium text-emerald-700">
                  Saved ~{formatMoney(pantry.savedEur, currency)} this week
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Weekly kitchen check — inline, never over the list (F-PM-13) */}
        <PantryCheckBanner />

        {/* F3 §6.4 ghost state (free tier): real seeded item count + the real
            savings this list would have seen */}
        {pantry && !pantry.entitled && (
          <PantryGhostBanner savedEur={pantry.savedEur} currency={currency} />
        )}

        {!weekList?.hasPlan ? (
          /* Empty state */
          <Card testID="shopping-empty" className="items-center border-dashed py-12">
            <Ionicons name="cart-outline" size={40} color="#d1d5db" />
            <Text className="mb-1 mt-3 font-semibold text-gray-700">
              No meal plan for this week
            </Text>
            <Text variant="muted" className="mb-4 text-center text-sm">
              Generate a meal plan to get a personalised shopping list.
            </Text>
            <Link href="/meal-plan" asChild>
              <Button>Go to Meal Planner</Button>
            </Link>
          </Card>
        ) : (
          <>
            {/* Premium AI consolidation */}
            {isPremium === true && (
              <Button
                testID="regenerate-list"
                variant="outline"
                loading={regenerateMutation.isPending}
                onPress={() => regenerateMutation.mutate({ weekOffset })}
              >
                {regenerateMutation.isPending ? 'Consolidating with AI…' : 'Regenerate with AI'}
              </Button>
            )}
            {regenerateMutation.isError && (
              <Text testID="regenerate-error" className="text-xs text-red-600">
                Couldn&apos;t rebuild the list — your list and ticks are unchanged. Try again.
              </Text>
            )}

            {/* Add your own item */}
            <View className="flex-row gap-2">
              <TextInput
                testID="add-item-input"
                value={newItemText}
                onChangeText={setNewItemText}
                onSubmitEditing={handleAddItem}
                placeholder="Add item… e.g. 2 kg flour"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
              <Pressable
                testID="add-item-submit"
                accessibilityRole="button"
                accessibilityLabel="Add item"
                onPress={handleAddItem}
                disabled={addItemMutation.isPending}
                className="h-11 w-11 items-center justify-center rounded-md bg-primary"
              >
                <Ionicons name="add" size={22} color="white" />
              </Pressable>
            </View>

            {/* Category groups */}
            {grouped.map(({ category, label, items: catItems }) => {
              const isExpanded = expandedCategories[category] ?? false;
              const catDone = catItems.filter((i) => checkedItems.includes(i.key)).length;
              return (
                <View key={category}>
                  <Pressable
                    testID={`category-${category}`}
                    accessibilityRole="button"
                    onPress={() => toggleCategory(category)}
                    className="mb-2 min-h-11 flex-row items-center justify-between px-1"
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                      {label}{' '}
                      <Text className="text-xs font-normal normal-case text-gray-500">
                        {catItems.length} item{catItems.length !== 1 ? 's' : ''}
                        {catDone > 0 ? ` · ${catDone} done` : ''}
                      </Text>
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {catDone === catItems.length && catItems.length > 0 && (
                        <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                          <Text className="text-[12px] font-bold text-emerald-700">✓ all</Text>
                        </View>
                      )}
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#9ca3af"
                      />
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View className="gap-2">
                      {catItems.map((item) => {
                        const isChecked = checkedItems.includes(item.key);
                        const quantityLabel = Number.isFinite(Number(item.quantity))
                          ? formatQuantity(Number(item.quantity), item.unit, unitSystem)
                          : `${item.quantity} ${item.unit}`;
                        return (
                          <View
                            key={item.key}
                            className={cn(
                              'flex-row items-center rounded-xl border',
                              isChecked
                                ? 'border-gray-100 bg-gray-50 opacity-70'
                                : item.pantryCovered
                                  ? 'border-emerald-200 bg-emerald-50/40'
                                  : 'border-border bg-white',
                            )}
                          >
                            {/* Primary target — toggles bought/not */}
                            <Pressable
                              testID={`item-${item.key}`}
                              accessibilityRole="button"
                              accessibilityState={{ checked: isChecked }}
                              onPress={() => toggleItem(item.key)}
                              className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 p-2"
                            >
                              <Image
                                source={{ uri: item.imageUrl || FALLBACK_IMAGE }}
                                className="h-12 w-12 rounded-lg"
                                resizeMode="cover"
                              />
                              <View className="min-w-0 flex-1">
                                <View className="flex-row items-center gap-1.5">
                                  <Text
                                    numberOfLines={1}
                                    className={cn(
                                      'shrink text-sm font-medium',
                                      isChecked ? 'text-gray-500 line-through' : 'text-gray-800',
                                    )}
                                  >
                                    {item.ingredientName}
                                  </Text>
                                  {item.pantryCovered && (
                                    <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                                      <Text className="text-[12px] font-semibold uppercase text-emerald-700">
                                        Have it
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text numberOfLines={1} className="text-xs text-gray-500">
                                  {quantityLabel}
                                  {item.estimatedPriceEur != null &&
                                    ` · ~${formatMoney(item.estimatedPriceEur, currency)}`}
                                  {item.pantryCovered && ' · in your kitchen'}
                                </Text>
                              </View>
                              <View
                                className={cn(
                                  'h-6 w-6 items-center justify-center rounded-full border-2',
                                  isChecked ? 'border-primary bg-primary' : 'border-gray-300',
                                )}
                              >
                                {isChecked && <Ionicons name="checkmark" size={14} color="white" />}
                              </View>
                            </Pressable>

                            {/* Secondary target — re-add (pantry) or remove (custom) */}
                            {item.pantryCovered ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Out of ${item.ingredientName} — add it back`}
                                disabled={markOutMutation.isPending}
                                onPress={() =>
                                  markOutMutation.mutate({ ingredientName: item.ingredientName })
                                }
                                className="h-11 w-11 items-center justify-center"
                              >
                                <Ionicons name="refresh-outline" size={18} color="#059669" />
                              </Pressable>
                            ) : item.isCustom ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${item.ingredientName}`}
                                disabled={removeItemMutation.isPending}
                                onPress={() => {
                                  if (weekList.planId) {
                                    removeItemMutation.mutate({
                                      planId: weekList.planId,
                                      key: item.key,
                                    });
                                  }
                                }}
                                className="h-11 w-11 items-center justify-center"
                              >
                                <Ionicons name="close" size={18} color="#9ca3af" />
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
