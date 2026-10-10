import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  ErrorState,
  haptics,
  IconButton,
  KeyboardAwareScrollView,
  Screen,
  SearchField,
  SegmentedControl,
  Text,
  useScrollFieldIntoView,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  defaultWeekOffset,
  deviceLocale,
  formatApproxPriceHint,
  formatMoney,
  formatPriceRange,
  getWeekStartDate,
  isConvertedCurrency,
  labelCaveatCompactText,
  parseCustomItemInput,
  shoppingWindowLabel,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useCurrency } from '../../../hooks/use-currency';
import { useHousehold } from '../../../hooks/use-household';
import { useIsOnline } from '../../../hooks/use-is-online';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { useUnits } from '../../../hooks/use-units';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { LockedFeatureCard } from '../../premium/locked-feature-card';
import { LabelCaveat } from '../../safety/label-caveat';
import {
  isAisleExpanded,
  loadExpandedAisles,
  saveExpandedAisles,
  type ExpandedAisles,
} from '../../shopping-list/expanded-store';
import {
  isPendingItem,
  withPendingItems,
  type ShopListItem,
} from '../../shopping-list/pending-item';
import { ShareListSheet } from '../../shopping-list/share-list-sheet';
import { AskChefAction } from '../add-action';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import { shopGroups, shopGroupStatus, type ShopGroup } from './shop-groups';

// ─── Shop (10 Oct redesign, board "Shop") ──────────────────────────────────
// The old Shop tab (`app/(food)/shopping-list.tsx`, kept for the old shell)
// with less text: This week / Next week, one price chip and a done count,
// ONE field that searches the list as you type and adds what you typed with
// +, and an aisle card per group whose ticked items sink to the bottom.
// Same data and writes: `shoppingList.getForWeek`, optimistic ticks
// (`toggleItems`), the pending "Not saved yet" row for an added item
// (`addCustomItems`), remove + Undo for your own items, the offline pill, the
// share sheet and the household lock. Owner-approved removals: thumbnails,
// per-item prices, recipe names, the "checked for your table" line, the
// portions chip.

type WeekOffset = 0 | 1;

const WEEK_OPTIONS = [
  { value: '0' as const, label: 'This week', testID: 'shop-week-0' },
  { value: '1' as const, label: 'Next week', testID: 'shop-week-1' },
];

export function ShopScreen() {
  const colors = useThemeColors();
  // T-08.1: the same default as Meals — next week from Friday 15:00 to Sunday.
  const [weekOffset, setWeekOffset] = useState<WeekOffset>(() => defaultWeekOffset(new Date()));
  // UX-SHOP-02: aisles are open by default and the choice is remembered.
  const [expandedAisles, setExpandedAisles] = useState<ExpandedAisles>(loadExpandedAisles);
  const [text, setText] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const isPremium = useIsPremium();
  const { memberCount, tablePortions } = useHousehold();
  const units = useUnits();
  const online = useIsOnline();
  // Prices are EUR estimates; shown in the user's currency (P2-6).
  const currency = useCurrency();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const weekStart = getWeekStartDate(weekOffset);

  const {
    data: weekList,
    isLoading,
    isError,
    refetch,
  } = trpc.shoppingList.getForWeek.useQuery({ weekOffset }, { staleTime: 60_000 });

  // T-10.4: the household's first scaled week is free (asked for free users only).
  const { data: planForWeek } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset },
    { staleTime: 60_000, enabled: isPremium === false },
  );
  const firstScaledWeek = isPremium === false && planForWeek?.firstScaledWeek === true;

  // WP-13: one `list_opened` per visit, once the list has loaded with items.
  const listOpenedTracked = useRef(false);
  useEffect(() => {
    if (listOpenedTracked.current || !weekList?.hasPlan) return;
    listOpenedTracked.current = true;
    track('list_opened', { itemCount: weekList.items.length });
  }, [weekList]);

  // Optimistic per-key tick (P1-5): flip now, the server merges devices.
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
      if (context?.previous)
        utils.shoppingList.getForWeek.setData({ weekOffset }, context.previous);
    },
  });

  // UX-SHOP-02: the new row shows at once, "Not saved yet" until the server answers.
  const addItemMutation = trpc.shoppingList.addCustomItems.useMutation({
    onMutate: async ({ items: added }) => {
      await utils.shoppingList.getForWeek.cancel({ weekOffset });
      const previous = utils.shoppingList.getForWeek.getData({ weekOffset });
      utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
        old ? withPendingItems(old, added, String(Date.now())) : old,
      );
      setText('');
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous)
        utils.shoppingList.getForWeek.setData({ weekOffset }, context.previous);
      // Give the text back so a failed add is one tap from a retry.
      setText(vars.items.map((i) => i.name).join(', '));
    },
    onSettled: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  // "Removed · Undo": Undo re-adds through its own mutation (not the field's).
  const undoRemoveMutation = trpc.shoppingList.addCustomItems.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
    onError: (err) =>
      snackbar.show({ message: `Couldn't put it back. ${userFacingErrorMessage(err)}` }),
  });
  const removeItemMutation = trpc.shoppingList.removeCustomItem.useMutation({
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  const removeCustomItem = (planId: string, item: ShopListItem) => {
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

  const items = weekList?.items ?? [];
  const checkedKeys = weekList?.checkedKeys ?? [];
  const checkedCount = checkedKeys.filter((key) => items.some((i) => i.key === key)).length;
  const groups = shopGroups(items, checkedKeys, text);
  const searching = text.trim().length > 0;

  const toggleGroup = useCallback((category: string) => {
    setExpandedAisles((prev) => {
      const next = { ...prev, [category]: !isAisleExpanded(prev, category) };
      saveExpandedAisles(next);
      return next;
    });
  }, []);

  const toggleItem = (key: string) => {
    if (!weekList?.planId) return;
    haptics.selection();
    toggleMutation.mutate({
      planId: weekList.planId,
      keys: [key],
      checked: !checkedKeys.includes(key),
    });
  };

  // T-21.5 (CI-14): keeps the field clear of the keyboard.
  const fieldRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  // The same parser as the old add box ("2 lb chicken thighs", UX-SHOP-01).
  const addTyped = () => {
    const parsed = parseCustomItemInput(text);
    if (!parsed.name || !weekList?.planId) return;
    Keyboard.dismiss();
    addItemMutation.mutate({ planId: weekList.planId, items: [parsed] });
  };

  const estimate = weekList?.estimatedTotalEur;
  const windowLabel = shoppingWindowLabel(weekList?.fromDayOfWeek);
  // UX-08 §7: a range, never one precise number; the window when the list is part of a week.
  const range = estimate != null ? formatPriceRange(estimate, currency, deviceLocale()) : null;
  const priceText =
    estimate != null
      ? `${range ? `≈ ${range}` : formatApproxPriceHint(estimate, currency)}${
          windowLabel ? ` · ${windowLabel}` : ''
        }`
      : null;

  const quantityLabel = (item: ShopListItem) =>
    Number.isFinite(Number(item.quantity))
      ? units.qty(Number(item.quantity), item.unit)
      : `${item.quantity} ${item.unit}`;

  const renderGroup = (group: ShopGroup<ShopListItem>) => {
    // A search shows every aisle with a match, open.
    const expanded = searching || isAisleExpanded(expandedAisles, group.category);
    const status = shopGroupStatus(group);
    return (
      <View
        key={group.category}
        testID={`shop-group-${group.category}`}
        className="overflow-hidden rounded-card border border-separator bg-surface"
      >
        <Pressable
          testID={`shop-group-${group.category}-header`}
          accessibilityRole="button"
          accessibilityLabel={`${group.label}, ${status}`}
          accessibilityState={{ expanded }}
          onPress={() => toggleGroup(group.category)}
          className="min-h-12 flex-row items-center gap-2 px-4 py-2.5"
        >
          <Text numberOfLines={1} className="min-w-0 flex-1 text-headline font-bold text-label">
            {group.label}
          </Text>
          <Text
            testID={`shop-group-${group.category}-status`}
            className={cn(
              'text-subhead',
              group.left === 0 ? 'font-semibold text-positive' : 'text-label-secondary',
            )}
          >
            {status}
          </Text>
          <Icon
            name={expanded ? 'chevronUp' : 'chevronDown'}
            color={colors.labelSecondary}
            size={18}
          />
        </Pressable>
        {expanded
          ? group.items.map((item) => {
              const checked = checkedKeys.includes(item.key);
              const pending = isPendingItem(item);
              const quantity = quantityLabel(item);
              return (
                <View key={item.key} className="flex-row items-center border-t border-separator">
                  <Pressable
                    testID={`shop-item-${item.key}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${item.ingredientName}, ${quantity}`}
                    accessibilityState={{ checked, disabled: pending }}
                    disabled={pending}
                    onPress={() => toggleItem(item.key)}
                    className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 py-1 pl-4 pr-3"
                  >
                    <View
                      className={cn(
                        'items-center justify-center rounded-inner border-2',
                        checked
                          ? 'border-positive bg-positive'
                          : 'border-label-tertiary bg-surface',
                      )}
                      style={{ width: 26, height: 26 }}
                    >
                      {checked ? <Icon name="checkmark" color={colors.onBrand} size={18} /> : null}
                    </View>
                    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                      <Text
                        numberOfLines={1}
                        className={cn(
                          'shrink text-body',
                          checked ? 'text-label-tertiary line-through' : 'text-label',
                        )}
                      >
                        {item.ingredientName}
                      </Text>
                      {/* T-01.9: the risk sits in a bought product — flagged inline. */}
                      {item.labelCheck && item.labelCheck.length > 0 ? (
                        <LabelCaveat
                          testID={`shop-item-${item.key}-label`}
                          text={labelCaveatCompactText()}
                          compact
                        />
                      ) : null}
                    </View>
                    <Text
                      testID={`shop-item-${item.key}-qty`}
                      numberOfLines={1}
                      className="text-subhead text-label-secondary"
                    >
                      {pending ? (online ? 'Saving…' : 'Not saved yet') : quantity}
                    </Text>
                  </Pressable>
                  {item.isCustom && !pending ? (
                    <IconButton
                      testID={`shop-item-${item.key}-remove`}
                      accessibilityLabel={`Remove ${item.ingredientName}`}
                      disabled={removeItemMutation.isPending}
                      icon={<Icon name="close" color={colors.labelTertiary} size={18} />}
                      onPress={() => {
                        if (weekList?.planId) removeCustomItem(weekList.planId, item);
                      }}
                    />
                  ) : null}
                </View>
              );
            })
          : null}
      </View>
    );
  };

  return (
    <Screen className="bg-canvas px-0">
      {/* The top bar's Share button opens this screen's share sheet. */}
      <ShellChromeProvider
        value={{
          kind: 'tab-root',
          title: 'Shop',
          actions: (
            <>
              <IconButton
                testID="shop-share"
                accessibilityLabel="Share the list"
                variant="tinted"
                disabled={items.length === 0}
                icon={<Icon name="share" color={colors.brand} />}
                onPress={() => setShareOpen(true)}
              />
              <AskChefAction />
            </>
          ),
        }}
      >
        <ShellTopBar className="mx-4 mt-3" />
      </ShellChromeProvider>
      {/* T-21.5 (CI-14): keeps the field clear of the keyboard. */}
      <KeyboardAwareScrollView
        testID="shop-scroll"
        contentContainerClassName="gap-3 px-4 pb-8 pt-3"
      >
        <SegmentedControl
          testID="shop-week"
          accessibilityLabel="Week"
          options={WEEK_OPTIONS}
          value={String(weekOffset) as '0' | '1'}
          onChange={(value) => setWeekOffset(Number(value) as WeekOffset)}
        />

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : isError && !weekList ? (
          // A failed load is not an empty list (F-X-3-1).
          <ErrorState title="Couldn't load your shopping list" onRetry={() => void refetch()} />
        ) : !weekList?.hasPlan ? (
          <View
            testID="shop-empty"
            className="items-center gap-3 rounded-card border border-separator bg-surface px-4 py-10"
          >
            <Icon name="cart" color={colors.labelTertiary} size={36} />
            <Text className="text-center text-headline font-semibold text-label">
              No meal plan for this week
            </Text>
            <Text className="text-center text-subhead text-label-secondary">
              Plan your meals to get a shopping list.
            </Text>
            <Button testID="shop-empty-plan" onPress={() => router.navigate('/plan')}>
              Go to Meals
            </Button>
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-2">
              {priceText ? (
                <Text
                  testID="shop-total"
                  accessibilityLabel={
                    isConvertedCurrency(currency) && estimate != null
                      ? `Estimated total about ${formatMoney(estimate, currency)}, converted from euros at an approximate rate`
                      : `Estimated total ${priceText}`
                  }
                  className="rounded-full border border-separator bg-surface px-3 py-1 text-subhead font-semibold text-label"
                >
                  {priceText}
                </Text>
              ) : null}
              {items.length > 0 ? (
                <Text
                  testID="shop-done-count"
                  className="rounded-full border border-separator bg-surface px-3 py-1 text-subhead font-semibold text-label"
                >
                  {checkedCount} of {items.length} done
                </Text>
              ) : null}
            </View>

            {/* UX-SHOP-02: say so when changes are waiting for a connection. */}
            {!online ? (
              <Text
                testID="shop-offline-pill"
                accessibilityLiveRegion="polite"
                className="self-start rounded-full bg-brand-tint px-3 py-1 text-caption font-semibold text-attention"
              >
                Offline · changes sync when you&apos;re back
              </Text>
            ) : null}

            {/* T-10.4: a free household's list is sized for 1 after its first week. */}
            {isPremium === false &&
            !firstScaledWeek &&
            weekList.portions == null &&
            memberCount > 0 ? (
              <LockedFeatureCard
                testID="shop-household-locked"
                source="household"
                compact
                job={
                  tablePortions != null && tablePortions > 1
                    ? `Keep portions for your table of ${tablePortions}`
                    : 'Keep portions right for your table'
                }
              />
            ) : null}

            <View className="flex-row items-center gap-2">
              <SearchField
                ref={fieldRef}
                testID="shop-field"
                accessibilityLabel="Search or add an item"
                placeholder="Search or add an item"
                value={text}
                onChangeText={setText}
                onFocus={() => scrollFieldIntoView(fieldRef.current)}
                onSubmitEditing={addTyped}
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                autoCapitalize="sentences"
                className="min-w-0 flex-1"
              />
              <IconButton
                testID="shop-add"
                accessibilityLabel="Add item"
                variant="filled"
                icon={<Icon name="add" color={colors.onBrand} size={26} />}
                onPress={addTyped}
              />
            </View>

            {searching && groups.length === 0 ? (
              <Text testID="shop-no-match" className="px-1 text-subhead text-label-secondary">
                Not on your list. Tap + to add “{text.trim()}”.
              </Text>
            ) : null}

            {groups.map(renderGroup)}
          </>
        )}
      </KeyboardAwareScrollView>
      <ShareListSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        weekOffset={weekOffset}
        weekStart={weekStart}
        items={items}
        checkedKeys={checkedKeys}
        fromDayOfWeek={weekList?.fromDayOfWeek}
        portions={weekList?.portions ?? null}
      />
    </Screen>
  );
}
