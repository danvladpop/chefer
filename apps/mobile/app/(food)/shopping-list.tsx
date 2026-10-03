import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  SegmentedControl,
  Text,
  useScrollFieldIntoView,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  checkedForListHeaderText,
  cn,
  defaultWeekOffset,
  deviceLocale,
  formatApproxPrice,
  formatDate,
  formatMoney,
  formatPriceRange,
  getWeekStartDate,
  isConvertedCurrency,
  labelCaveatCompactText,
  parseCustomItemInput,
  perPortionCost,
  shoppingWindowLabel,
  userFacingErrorMessage,
} from '@chefer/utils';
import { useAiConsent } from '../../src/features/ai-consent/ai-consent-provider';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { PantryCheckBanner } from '../../src/features/pantry/pantry-check-banner';
import { PantryGhostBanner } from '../../src/features/pantry/pantry-ghost-banner';
import { PantryPanel } from '../../src/features/pantry/pantry-panel';
import { LockedFeatureCard } from '../../src/features/premium/locked-feature-card';
import { LabelCaveat } from '../../src/features/safety/label-caveat';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../src/features/shopping-list/categories';
import { CategoryHeader } from '../../src/features/shopping-list/category-header';
import {
  isAisleExpanded,
  loadExpandedAisles,
  saveExpandedAisles,
  type ExpandedAisles,
} from '../../src/features/shopping-list/expanded-store';
import { isPendingItem, withPendingItems } from '../../src/features/shopping-list/pending-item';
import { ShareListSheet } from '../../src/features/shopping-list/share-list-sheet';
import { useCurrency } from '../../src/hooks/use-currency';
import { useHousehold } from '../../src/hooks/use-household';
import { useIsOnline } from '../../src/hooks/use-is-online';
import { useIsPremium } from '../../src/hooks/use-is-premium';
import { useUnits } from '../../src/hooks/use-units';
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

export default function ShoppingListScreen() {
  // Deep links (/shopping-list?view=kitchen) open the kitchen segment.
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ShopView>(params.view === 'kitchen' ? 'kitchen' : 'list');
  // T-08.1 (UX-08 AC1): same default as Plan — next week Fri 15:00–Sun,
  // else this week — so Plan and Shop always agree on which week opens.
  const [weekOffset, setWeekOffset] = useState<number>(() => defaultWeekOffset(new Date()));
  // UX-SHOP-02: aisles are open by default and the choice is remembered.
  const [expandedAisles, setExpandedAisles] = useState<ExpandedAisles>(loadExpandedAisles);
  const [newItemText, setNewItemText] = useState('');
  const isPremium = useIsPremium();
  const { memberCount, tablePortions } = useHousehold();
  const [shareOpen, setShareOpen] = useState(false);
  const units = useUnits();
  const online = useIsOnline();
  // Prices are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = useCurrency();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();

  const weekStart = getWeekStartDate(weekOffset);

  const {
    data: weekList,
    isLoading,
    isError,
    refetch: refetchList,
  } = trpc.shoppingList.getForWeek.useQuery({ weekOffset }, { staleTime: 60_000 });

  // T-10.4: the household's first scaled week is free — the plan says so.
  // Only asked for free users (premium is always scaled, nothing to explain).
  const { data: planForWeek } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset },
    { staleTime: 60_000, enabled: isPremium === false },
  );
  const firstScaledWeek = isPremium === false && planForWeek?.firstScaledWeek === true;

  // B-13 (T-00.15): confirms the server sent the WEEK actually asked for —
  // a monitoring signal for the "next week shown as this week" bug class,
  // not just this one fix. No mobile analytics SDK yet (see
  // src/features/gym/analytics.ts) — dev-only stub, wired to the real
  // transport in wave 1.
  useEffect(() => {
    if (isLoading) return;
    const weekMatches =
      !weekList?.hasPlan ||
      new Date(weekList.weekStartDate).toDateString() === weekStart.toDateString();
    if (__DEV__) console.warn('[analytics stub] plan_shown', { surface: 'shop', weekMatches });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per load, not on every render
  }, [weekList?.planId, weekList?.weekStartDate, isLoading, weekOffset]);

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

  // UX-SHOP-02: the new row shows up at once, marked "Not saved yet" until the
  // server answers (offline, the mutation waits and the row stays) — so there
  // is no empty feeling that gets the same item typed twice.
  const addItemMutation = trpc.shoppingList.addCustomItems.useMutation({
    onMutate: async ({ items: added }) => {
      await utils.shoppingList.getForWeek.cancel({ weekOffset });
      const previous = utils.shoppingList.getForWeek.getData({ weekOffset });
      utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
        old ? withPendingItems(old, added, String(Date.now())) : old,
      );
      setNewItemText('');
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        utils.shoppingList.getForWeek.setData({ weekOffset }, context.previous);
      }
      // Give the text back so a failed add is one tap from a retry.
      setNewItemText(vars.items.map((i) => i.name).join(', '));
    },
    onSettled: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  // UX-SHOP-02: "Removed · Undo". Undo re-adds the item through its own
  // mutation (not `addItemMutation`, whose success clears the add-item field).
  const undoRemoveMutation = trpc.shoppingList.addCustomItems.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
    onError: (err) =>
      snackbar.show({ message: `Couldn't put it back. ${userFacingErrorMessage(err)}` }),
  });
  const removeItemMutation = trpc.shoppingList.removeCustomItem.useMutation({
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  const removeCustomItem = (
    planId: string,
    item: { key: string; ingredientName: string; quantity: string; unit: string },
  ) => {
    const quantity = parseFloat(item.quantity);
    removeItemMutation.mutate(
      { planId, key: item.key },
      {
        onSuccess: () =>
          snackbar.show({
            message: `Removed ${item.ingredientName}`,
            actionLabel: 'Undo',
            onAction: () =>
              undoRemoveMutation.mutate({
                planId,
                items: [
                  {
                    name: item.ingredientName,
                    ...(quantity > 0 && quantity <= 999 ? { quantity } : {}),
                    ...(item.unit ? { unit: item.unit } : {}),
                  },
                ],
              }),
          }),
      },
    );
  };
  const markOutMutation = trpc.pantry.markOutOfStock.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getForWeek.invalidate();
      void utils.pantry.list.invalidate();
    },
  });
  // Sends the plan's ingredients to the AI — ask first (App Store 5.1.2(i)).
  const requestAiConsent = useAiConsent();
  const regenerateMutation = trpc.shoppingList.regenerate.useMutation({
    meta: { silent: true },
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
    setExpandedAisles((prev) => {
      const next = { ...prev, [cat]: !isAisleExpanded(prev, cat) };
      saveExpandedAisles(next);
      return next;
    });
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

  // T-21.5 (CI-14, PAT-11): keeps "Add item" clear of the keyboard.
  const addItemInputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  const handleAddItem = () => {
    const parsed = parseCustomItemInput(newItemText);
    if (!parsed.name || !weekList?.planId) {
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
      {/* T-21.5 (CI-14, PAT-11): keeps "Add item" clear of the keyboard;
          `keyboardShouldPersistTaps="handled"` is already the component's
          default. */}
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 py-4">
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
              Week of {formatDate(weekStart, 'long')}
              {items.length > 0 ? ` · ${checkedCount}/${items.length} done` : ''}
              {/* A plan made mid-week lists only the remaining days (audit F-PM-3) */}
              {shoppingWindowLabel(weekList?.fromDayOfWeek)
                ? ` · covers ${shoppingWindowLabel(weekList?.fromDayOfWeek)}`
                : ''}
            </Text>
          </View>
          <View className="flex-row gap-1">
            <Pressable
              testID="share-list"
              accessibilityRole="button"
              accessibilityLabel="Share the list"
              accessibilityState={{ disabled: items.length === 0 }}
              disabled={items.length === 0}
              onPress={() => setShareOpen(true)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full border border-border',
                items.length === 0 && 'opacity-40',
              )}
            >
              <Ionicons
                name={Platform.select({ ios: 'share-outline', default: 'share-social-outline' })}
                size={18}
                color="#6b7280"
              />
            </Pressable>
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

        {/* UX-SHOP-02: say so when changes are waiting for a connection. */}
        {!online && (
          <View
            testID="shop-offline-pill"
            accessibilityLiveRegion="polite"
            className="flex-row items-center gap-1.5 self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1"
          >
            <Ionicons name="cloud-offline-outline" size={13} color="#b45309" />
            <Text className="text-xs font-medium text-amber-800">
              Offline · changes sync when you&apos;re back
            </Text>
          </View>
        )}

        {/* T-02.1/T-02.4: the table has rules, so this list's items were
            checked against them (PAT-2, UX-02 §3). */}
        {weekList?.tableSafety?.hasRules && (
          <View testID="shopping-safety-line" className="flex-row items-center gap-1.5">
            <Ionicons name="shield-checkmark-outline" size={13} color="#944a00" />
            <Text className="text-xs font-medium text-primary">
              {checkedForListHeaderText(items.length)}
            </Text>
          </View>
        )}

        {/* Cost badges (UX-08 §7/AC6: a range, never a single precise
            number; §7/AC7: the pantry savings chip is gone — B-33 until
            savings can be itemised). */}
        {weekList?.estimatedTotalEur != null && (
          <View className="flex-row flex-wrap gap-2">
            <View
              className="rounded-full border border-border bg-gray-50 px-3 py-1"
              accessibilityLabel={
                isConvertedCurrency(currency)
                  ? `Estimated total about ${formatMoney(weekList.estimatedTotalEur, currency)}, converted from euros at an approximate rate`
                  : undefined
              }
            >
              <Text testID="shopping-total" className="text-xs font-medium text-gray-600">
                Est. total{' '}
                {formatPriceRange(weekList.estimatedTotalEur, currency, deviceLocale()) ??
                  `~${formatApproxPrice(weekList.estimatedTotalEur, currency)}`}
                {/* UX-PLAN-07: the total covers the same days as the list. */}
                {shoppingWindowLabel(weekList.fromDayOfWeek)
                  ? ` · ${shoppingWindowLabel(weekList.fromDayOfWeek)}`
                  : ''}
              </Text>
            </View>
            {/* Who the quantities are for (P2-3, F-PM-5): a premium
                household's list is scaled to the table. */}
            {weekList.portions != null && (
              <View className="rounded-full border border-primary/20 bg-accent px-3 py-1">
                <Text testID="shopping-portions" className="text-xs font-medium text-primary">
                  For {weekList.portions} portions
                  {` · ~${formatApproxPrice(
                    perPortionCost(weekList.estimatedTotalEur, weekList.portions) ?? 0,
                    currency,
                  )} each`}
                </Text>
              </View>
            )}
            {weekList.hasPlan && weekList.portions == null && memberCount > 0 && (
              <View className="rounded-full border border-border bg-gray-50 px-3 py-1">
                <Text testID="shopping-one-portion" className="text-xs font-medium text-gray-600">
                  Sized for 1 portion
                </Text>
              </View>
            )}
          </View>
        )}

        {/* T-10.4: household first week is free — say so; from week 2 the
            list is sized for 1 and a lock card offers the table's portions. */}
        {firstScaledWeek && weekList?.portions != null && (
          <Text testID="shopping-first-week" className="text-xs font-medium text-primary">
            Sized for your table of {weekList.portions} — free for your first week
          </Text>
        )}
        {isPremium === false &&
          !firstScaledWeek &&
          weekList?.hasPlan &&
          weekList.portions == null &&
          memberCount > 0 && (
            <LockedFeatureCard
              testID="shopping-household-locked"
              source="household"
              compact
              job={
                tablePortions != null && tablePortions > 1
                  ? `Keep portions for your table of ${tablePortions}`
                  : 'Keep portions right for your table'
              }
            />
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
                onPress={() =>
                  requestAiConsent('shopping-list', () => regenerateMutation.mutate({ weekOffset }))
                }
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
                ref={addItemInputRef}
                testID="add-item-input"
                value={newItemText}
                onChangeText={setNewItemText}
                onFocus={() => scrollFieldIntoView(addItemInputRef.current)}
                onSubmitEditing={handleAddItem}
                placeholder={units.addItemPlaceholder}
                accessibilityLabel="Add an item to your shopping list"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
              <Pressable
                testID="add-item-submit"
                accessibilityRole="button"
                accessibilityLabel="Add item"
                onPress={handleAddItem}
                className="h-11 w-11 items-center justify-center rounded-md bg-primary"
              >
                <Ionicons name="add" size={22} color="white" />
              </Pressable>
            </View>

            {/* Category groups */}
            {grouped.map(({ category, label, items: catItems }) => {
              const isExpanded = isAisleExpanded(expandedAisles, category);
              const catDone = catItems.filter((i) => checkedItems.includes(i.key)).length;
              return (
                <View key={category}>
                  <CategoryHeader
                    testID={`category-${category}`}
                    label={label}
                    itemCount={catItems.length}
                    doneCount={catDone}
                    expanded={isExpanded}
                    onPress={() => toggleCategory(category)}
                  />

                  {isExpanded && (
                    <View className="gap-2">
                      {catItems.map((item) => {
                        const isChecked = checkedItems.includes(item.key);
                        const pending = isPendingItem(item);
                        const quantityLabel = Number.isFinite(Number(item.quantity))
                          ? units.qty(Number(item.quantity), item.unit)
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
                              accessibilityState={{ checked: isChecked, disabled: pending }}
                              disabled={pending}
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
                                      <Text className="text-xs font-semibold uppercase text-emerald-700">
                                        Have it
                                      </Text>
                                    </View>
                                  )}
                                  {/* T-01.9: the risk sits in a bought product
                                      (e.g. stock, oats, soy sauce) — the item
                                      stays on the list, flagged inline. */}
                                  {item.labelCheck && item.labelCheck.length > 0 && (
                                    <LabelCaveat
                                      testID={`shop-item-${item.key}-label`}
                                      text={labelCaveatCompactText()}
                                      compact
                                    />
                                  )}
                                </View>
                                <Text numberOfLines={1} className="text-xs text-gray-500">
                                  {quantityLabel}
                                  {item.estimatedPriceEur != null &&
                                    ` · ~${formatApproxPrice(item.estimatedPriceEur, currency)}`}
                                  {item.pantryCovered && ' · in your kitchen'}
                                  {pending && (online ? ' · Saving…' : ' · Not saved yet')}
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
                            ) : item.isCustom && !pending ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${item.ingredientName}`}
                                disabled={removeItemMutation.isPending}
                                onPress={() => {
                                  if (weekList.planId) {
                                    removeCustomItem(weekList.planId, item);
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
      </KeyboardAwareScrollView>
      <ShareListSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        weekOffset={weekOffset}
        weekStart={weekStart}
        items={items}
        checkedKeys={checkedItems}
        fromDayOfWeek={weekList?.fromDayOfWeek}
        portions={weekList?.portions ?? null}
      />
    </Screen>
  );
}
