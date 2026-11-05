import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { router, useIsFocused } from 'expo-router';
import type { ListPersonDto } from '@chefer/types';
import {
  AnimatedCheck,
  Button,
  Celebration,
  duration,
  ErrorState,
  haptics,
  IconButton,
  KeyboardAwareScrollView,
  listEntering,
  listExiting,
  listLayout,
  Rotate,
  Screen,
  SearchField,
  SegmentedControl,
  StrikeLine,
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
  parseCustomItemInput,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useCurrency } from '../../../hooks/use-currency';
import { useHousehold } from '../../../hooks/use-household';
import { useIsOnline } from '../../../hooks/use-is-online';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { useUnits } from '../../../hooks/use-units';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { PartnerBanner } from '../../household/sharing/partner-banner';
import { useHouseholdSharing } from '../../household/sharing/use-household-sharing';
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
import {
  addedByText,
  checkedByText,
  shellAisleLabel,
  shopWindowText,
} from '../../shopping-list/shop-copy';
import { useSharedListSync } from '../../shopping-list/use-shared-list-sync';
import { useCheckedWithPending, useShopToggle } from '../../shopping-list/use-shop-toggle';
import { AskChefAction } from '../add-action';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import { shopGroups, type ShopGroup } from './shop-groups';

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
// ADR 0003 (household sharing): ticks go through the durable outbox
// (use-shop-toggle.ts); a shared list polls `shoppingList.sync` while this tab
// is focused and says who ticked or added an item; a partner sees whose list it is.

type WeekOffset = 0 | 1;

/** A finished aisle folds shut after its last strike has had time to play. */
const AISLE_FOLD_DELAY_MS = duration.deliberate;

export function ShopScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const weekOptions = [
    { value: '0' as const, label: t('plan.shopping.weeks.thisWeek'), testID: 'shop-week-0' },
    { value: '1' as const, label: t('plan.shopping.weeks.nextWeek'), testID: 'shop-week-1' },
  ];
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

  // Optimistic per-key tick (P1-5): flip now, the server merges devices. ADR 0003:
  // through the durable outbox, so a tick made offline survives the app being killed.
  const toggleItems = useShopToggle(weekOffset);
  // ADR 0003: a shared household's list is live while this tab is on screen.
  const sharing = useHouseholdSharing();
  const isFocused = useIsFocused();
  const checkedBy = useSharedListSync({
    weekOffset,
    planId: weekList?.planId,
    enabled: sharing.shared && isFocused,
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
      snackbar.show({
        message: t('plan.shopping.undoFailed', { reason: userFacingErrorMessage(err) }),
      }),
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
            message: t('plan.shopping.removed', { name: item.ingredientName }),
            actionLabel: t('plan.shopping.undo'),
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
  const checkedKeys = useCheckedWithPending(weekList?.checkedKeys, weekList?.planId);
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

  // MO-18: the whole list done earns one burst; MO-05: a finished aisle folds
  // shut once its last strike has played (not saved, so it reopens next time).
  const [listBurst, setListBurst] = useState(0);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (foldTimer.current) clearTimeout(foldTimer.current);
    },
    [],
  );

  const toggleItem = (key: string) => {
    if (!weekList?.planId) return;
    const checking = !checkedKeys.includes(key);
    if (checking) {
      haptics.tick();
      const open = items.filter((i) => !checkedKeys.includes(i.key));
      const category = items.find((i) => i.key === key)?.category;
      const openInAisle = open.filter((i) => i.category === category).length;
      if (open.length === 1) {
        haptics.success();
        setListBurst((b) => b + 1);
      } else if (openInAisle === 1 && category !== undefined && !searching) {
        if (foldTimer.current) clearTimeout(foldTimer.current);
        foldTimer.current = setTimeout(() => {
          setExpandedAisles((prev) => ({ ...prev, [category]: false }));
        }, AISLE_FOLD_DELAY_MS);
      }
    } else {
      haptics.selection();
    }
    toggleItems(weekList.planId, [key], checking);
  };

  // T-21.5 (CI-14): keeps the field clear of the keyboard.
  const fieldRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  // The same parser as the old add box ("2 lb chicken thighs", UX-SHOP-01).
  // 11 Oct owner feedback: "+" with nothing typed did nothing at all, which
  // read as a dead button (on Android and iOS alike) — it now opens the
  // field so the item can be typed, and adds it on the next tap or Return.
  const addTyped = () => {
    const parsed = parseCustomItemInput(text);
    if (!parsed.name) {
      fieldRef.current?.focus();
      return;
    }
    if (!weekList?.planId) return;
    Keyboard.dismiss();
    addItemMutation.mutate({ planId: weekList.planId, items: [parsed] });
  };

  const estimate = weekList?.estimatedTotalEur;
  const windowLabel = shopWindowText(t, weekList?.fromDayOfWeek);
  // UX-08 §7: a range, never one precise number; the window when the list is part of a week.
  const range = estimate != null ? formatPriceRange(estimate, currency, deviceLocale()) : null;
  const price =
    estimate != null
      ? range
        ? t('plan.shopping.priceApprox', { range })
        : formatApproxPriceHint(estimate, currency)
      : null;
  const priceText =
    price != null && windowLabel
      ? t('plan.shopping.withWindow', { text: price, window: windowLabel })
      : price;

  const quantityLabel = (item: ShopListItem) =>
    Number.isFinite(Number(item.quantity))
      ? units.qty(Number(item.quantity), item.unit)
      : `${item.quantity} ${item.unit}`;

  // ADR 0003: the live sync's "who" is fresher than the list's own.
  const whoLine = (item: ShopListItem, checked: boolean): string | null => {
    if (checked) {
      const by: ListPersonDto | undefined = checkedBy[item.key] ?? item.checkedBy;
      if (by) return checkedByText(t, by);
    }
    return item.addedBy ? addedByText(t, item.addedBy) : null;
  };

  const renderGroup = (group: ShopGroup<ShopListItem>) => {
    // A search shows every aisle with a match, open.
    const expanded = searching || isAisleExpanded(expandedAisles, group.category);
    const label = shellAisleLabel(t, group.category);
    const status =
      group.left === 0
        ? t('plan.shopping.aisleFinished')
        : t('plan.shopping.aisleLeft', { left: group.left, total: group.total });
    return (
      <Animated.View
        key={group.category}
        testID={`shop-group-${group.category}`}
        layout={listLayout}
        className="overflow-hidden rounded-card border border-separator bg-surface"
      >
        <Pressable
          testID={`shop-group-${group.category}-header`}
          accessibilityRole="button"
          accessibilityLabel={t('plan.shopping.aisleLabel', { label, status })}
          accessibilityState={{ expanded }}
          onPress={() => toggleGroup(group.category)}
          className="min-h-12 flex-row items-center gap-2 px-4 py-2.5"
        >
          <Text numberOfLines={1} className="min-w-0 flex-1 text-headline font-bold text-label">
            {label}
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
          {/* MO-05: the chevron turns with the aisle. */}
          <Rotate turned={expanded}>
            <Icon name="chevronDown" color={colors.labelSecondary} size={18} />
          </Rotate>
        </Pressable>
        {expanded
          ? group.items.map((item) => {
              const checked = checkedKeys.includes(item.key);
              const pending = isPendingItem(item);
              const quantity = quantityLabel(item);
              const who = sharing.shared ? whoLine(item, checked) : null;
              return (
                <Animated.View
                  key={item.key}
                  entering={listEntering}
                  exiting={listExiting}
                  layout={listLayout}
                  className="flex-row items-center border-t border-separator"
                >
                  <Pressable
                    testID={`shop-item-${item.key}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t('plan.shopping.itemLabel', {
                      name: item.ingredientName,
                      quantity,
                    })}
                    accessibilityState={{ checked, disabled: pending }}
                    disabled={pending}
                    onPress={() => toggleItem(item.key)}
                    className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 py-1 pl-4 pr-3"
                  >
                    {/* MO-16: the box fills and the tick draws in. */}
                    <AnimatedCheck
                      checked={checked}
                      size={26}
                      shape="square"
                      fillColor={colors.positive}
                      checkColor={colors.onBrand}
                      ringColor={colors.labelTertiary}
                      emptyColor={colors.surface}
                    />
                    <View className="min-w-0 flex-1">
                      <View className="min-w-0 flex-row items-center gap-1.5">
                        {/* MO-17: a strike sweeps across the name instead of line-through. */}
                        <View className="relative shrink">
                          <Text
                            numberOfLines={1}
                            className={cn(
                              'text-body',
                              checked ? 'text-label-tertiary' : 'text-label',
                            )}
                          >
                            {item.ingredientName}
                          </Text>
                          <StrikeLine active={checked} color={colors.labelTertiary} />
                        </View>
                        {/* T-01.9: the risk sits in a bought product — flagged inline. */}
                        {item.labelCheck && item.labelCheck.length > 0 ? (
                          <LabelCaveat
                            testID={`shop-item-${item.key}-label`}
                            text={t('plan.shopping.labelCaveat')}
                            compact
                          />
                        ) : null}
                      </View>
                      {/* ADR 0003: "Ticked by Maria" / "Added by you" on a shared list. */}
                      {who ? (
                        <Text
                          testID={`shop-item-${item.key}-who`}
                          numberOfLines={1}
                          className="text-caption text-label-secondary"
                        >
                          {who}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      testID={`shop-item-${item.key}-qty`}
                      numberOfLines={1}
                      className="text-subhead text-label-secondary"
                    >
                      {pending
                        ? online
                          ? t('common.states.saving')
                          : t('plan.shopping.notSavedYet')
                        : quantity}
                    </Text>
                  </Pressable>
                  {item.isCustom && !pending ? (
                    <IconButton
                      testID={`shop-item-${item.key}-remove`}
                      accessibilityLabel={t('plan.shopping.removeItem', {
                        name: item.ingredientName,
                      })}
                      disabled={removeItemMutation.isPending}
                      icon={<Icon name="close" color={colors.labelTertiary} size={18} />}
                      onPress={() => {
                        if (weekList?.planId) removeCustomItem(weekList.planId, item);
                      }}
                    />
                  ) : null}
                </Animated.View>
              );
            })
          : null}
      </Animated.View>
    );
  };

  return (
    <Screen className="bg-canvas px-0">
      {/* The top bar's Share button opens this screen's share sheet. */}
      <ShellChromeProvider
        value={{
          kind: 'tab-root',
          title: t('plan.shopping.title'),
          actions: (
            <>
              <IconButton
                testID="shop-share"
                accessibilityLabel={t('plan.shopping.shareList')}
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
          accessibilityLabel={t('plan.shopping.weekPicker')}
          options={weekOptions}
          value={String(weekOffset) as '0' | '1'}
          onChange={(value) => setWeekOffset(Number(value) as WeekOffset)}
        />

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : isError && !weekList ? (
          // A failed load is not an empty list (F-X-3-1).
          <ErrorState title={t('plan.shopping.loadError')} onRetry={() => void refetch()} />
        ) : !weekList?.hasPlan ? (
          <View
            testID="shop-empty"
            className="items-center gap-3 rounded-card border border-separator bg-surface px-4 py-10"
          >
            <Icon name="cart" color={colors.labelTertiary} size={36} />
            <Text className="text-center text-headline font-semibold text-label">
              {t('plan.shopping.empty.title')}
            </Text>
            <Text className="text-center text-subhead text-label-secondary">
              {t('plan.shopping.empty.shellBody')}
            </Text>
            <Button testID="shop-empty-plan" onPress={() => router.navigate('/plan')}>
              {t('plan.shopping.empty.shellCta')}
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
                      ? t('plan.shopping.estTotalLabelConverted', {
                          price: formatMoney(estimate, currency),
                        })
                      : t('plan.shopping.estTotalLabel', { price: priceText })
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
                  {t('plan.shopping.doneOfTotal', {
                    checked: String(checkedCount),
                    total: String(items.length),
                  })}
                </Text>
              ) : null}
            </View>

            {sharing.isPartner && sharing.ownerName ? (
              <PartnerBanner testID="shop-partner-banner" ownerName={sharing.ownerName} />
            ) : null}

            {/* UX-SHOP-02: say so when changes are waiting for a connection. */}
            {!online ? (
              <Text
                testID="shop-offline-pill"
                accessibilityLiveRegion="polite"
                className="self-start rounded-full bg-brand-tint px-3 py-1 text-caption font-semibold text-attention"
              >
                {t('plan.shopping.offline')}
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
                    ? t('plan.shopping.lockedJobTable', { count: tablePortions })
                    : t('plan.shopping.lockedJob')
                }
              />
            ) : null}

            <View className="flex-row items-center gap-2">
              <SearchField
                ref={fieldRef}
                testID="shop-field"
                accessibilityLabel={t('plan.shopping.add.searchOrAdd')}
                placeholder={t('plan.shopping.add.searchOrAdd')}
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
                accessibilityLabel={t('plan.shopping.add.buttonLabelShort')}
                accessibilityHint={
                  searching
                    ? t('plan.shopping.add.addsHint', { item: text.trim() })
                    : t('plan.shopping.add.typeHint')
                }
                variant="filled"
                icon={<Icon name="add" color={colors.onBrand} size={26} />}
                onPress={addTyped}
              />
            </View>

            {searching && groups.length === 0 ? (
              <Text testID="shop-no-match" className="px-1 text-subhead text-label-secondary">
                {t('plan.shopping.add.noMatch', { item: text.trim() })}
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
      <Celebration
        testID="shop-celebration"
        play={listBurst}
        colors={[colors.brand, colors.positive, colors.attention, colors.info]}
        origin={{ x: 0.5, y: 0.45 }}
      />
    </Screen>
  );
}
