'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LabelCaveat } from '@/features/safety/components/LabelCaveat';
import { ItemThumb } from '@/features/shopping-list/components/ItemThumb';
import { ShareListDialog } from '@/features/shopping-list/components/ShareListDialog';
import { WeekNavigator } from '@/features/shopping-list/components/WeekNavigator';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/features/shopping-list/share-list';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useCurrency } from '@/hooks/useCurrency';
import { useHousehold } from '@/hooks/useHousehold';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useUnits } from '@/hooks/useUnits';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import {
  CheckCircle2,
  ChevronDown,
  Info,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Printer,
  Share2,
  ShoppingCart,
  Smartphone,
  X,
} from 'lucide-react';
import { ErrorState, pressCard, pressControl, pressTransition, Sheet, useMenu } from '@chefer/ui';
import {
  checkedForListHeaderText,
  defaultWeekOffset,
  deviceLocale,
  formatApproxPrice,
  formatDate,
  formatPriceRange,
  getWeekStartDate,
  isConvertedCurrency,
  labelCaveatCompactText,
  parseCustomItemInput,
  perPortionCost,
  shoppingProvenanceText,
  shoppingWindowLabel,
  userFacingErrorMessage,
} from '@chefer/utils';

const PRINT_STYLES = `
@media print {
  nav, aside, header,
  [data-print-hide] { display: none !important; }
  body { margin: 0; font-family: serif; }
  button, input, [role="button"] { display: none !important; }
  .rounded-xl, .rounded-2xl { border-radius: 0 !important; box-shadow: none !important; }
  .shopping-list-print-header { display: block !important; font-size: 18px; font-weight: bold; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
}
.shopping-list-print-header { display: none; }
`;

const EXPANDED_STORAGE_KEY = 'chefer.shopping-expanded.v2';
/** Rows added optimistically carry this key prefix until the server answers (UX-SHOP-02). */
const PENDING_KEY_PREFIX = 'pending:';

export default function ShoppingListPage() {
  // FB7-10: the list is always the one computed from the plan's recipes — no AI
  // tidy-up, no "In my kitchen" pantry (both retired).
  // T-08.9 (UX-08 AC1, bug B-13): defaults to the SAME week as Plan — next
  // week from Friday 15:00 to Sunday 23:59 local, else this week — via the
  // shared `defaultWeekOffset` (@chefer/utils), not always 0.
  const [weekOffset, setWeekOffset] = useState<number>(() => defaultWeekOffset(new Date()));
  // Legacy localStorage keys are migrated to the server once (P1-5), then
  // cleared — the server's checkedKeys is the source of truth from then on.
  const [legacyChecked, , clearLegacyChecked] = useLocalStorage<string[]>('shopping-checked', []);
  const [popupItem, setPopupItem] = useState<{
    name: string;
    imageUrl: string;
    category: string;
  } | null>(null);
  // Overflow menu: keyboard + outside-click handling from the shared hook
  // (was a hand-rolled `fixed inset-0` click-catcher).
  const listMenu = useMenu();
  // T-13.3: `Send the list` dialog, opened from the overflow menu.
  const [shareOpen, setShareOpen] = useState(false);
  const isPremium = useIsPremium();
  const { memberCount } = useHousehold();
  const units = useUnits();
  // Prices are EUR estimates; shown in the user's currency (backlog P2-6).
  const currency = useCurrency();

  const weekStart = getWeekStartDate(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Fetch shopping list for the selected week
  const {
    data: weekList,
    isLoading: listLoading,
    isError: listError,
    isRefetching: listRefetching,
    refetch: refetchList,
  } = trpc.shoppingList.getForWeek.useQuery({ weekOffset }, { staleTime: 60_000 });

  // B-13 (T-00.15): confirms the server sent the WEEK actually asked for —
  // a monitoring signal for the "next week shown as this week" bug class,
  // not just this one fix. No-op until the analytics transport lands
  // (wave 1); `capture` already drops events until then (see lib/analytics).
  useEffect(() => {
    if (listLoading) return;
    const weekMatches =
      !weekList?.hasPlan ||
      new Date(weekList.weekStartDate).toDateString() === weekStart.toDateString();
    capture('plan_shown', { surface: 'shop', weekMatches });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per load, not on every render
  }, [weekList?.planId, weekList?.weekStartDate, listLoading, weekOffset]);

  // UX-PO-02: one `list_opened` per visit, once the list has loaded with a plan
  // (not per week switch or refetch — the funnel counts opens, not re-renders).
  const listOpenedTracked = useRef(false);
  useEffect(() => {
    if (listOpenedTracked.current || !weekList?.hasPlan) return;
    listOpenedTracked.current = true;
    capture('list_opened', { itemCount: weekList.items.length });
  }, [weekList]);

  // T-10.4 (D-7): the household first-week line reads the plan's flag; only a
  // free user with a plan can be on that week, so nobody else pays for the query.
  const { data: weekPlan } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset },
    { enabled: isPremium === false && weekList?.hasPlan === true, staleTime: 60_000 },
  );
  const firstScaledWeek = isPremium === false && weekPlan?.firstScaledWeek === true;

  const utils = trpc.useUtils();

  // Checked state is per-plan on the server — switching weeks just shows the
  // other plan's state.
  const handleWeekChange = useCallback((offset: number) => {
    setWeekOffset(offset);
  }, []);

  // Group items by category
  const items = weekList?.items ?? [];
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const totalItems = items.length;
  const checkedItems = weekList?.checkedKeys ?? [];
  const checkedCount = checkedItems.filter((key) => items.some((i) => i.key === key)).length;

  // Collapsible aisles (review F-3, UX-SHOP-02): open by default — the list is
  // what the page is for — and the choice is remembered on this device
  // (localStorage, not the session), so the list stays as you left it.
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
      if (raw) setExpandedCategories(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // Ignore malformed storage — the default (open) wins.
    }
  }, []);
  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = { ...prev, [cat]: !(prev[cat] ?? true) };
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full/blocked — the choice just won't persist.
      }
      return next;
    });
  }, []);

  // Optimistic per-key toggle (P1-5): flip in the cache immediately, sync in
  // the background — the shop has bad signal. Server semantics are per-key
  // add/remove, so concurrent devices merge instead of clobbering.
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
  });

  const toggleItem = (key: string) => {
    if (!weekList?.planId) return;
    toggleMutation.mutate({
      planId: weekList.planId,
      keys: [key],
      checked: !checkedItems.includes(key),
    });
  };

  // Custom items (the chat's addToShoppingList tool writes the same overlay)
  const [newItemText, setNewItemText] = useState('');
  // UX-SHOP-02: the new row shows at once ("Saving…") and the box clears; the
  // server's answer replaces it, a failure rolls it back and returns the text.
  const addItemMutation = trpc.shoppingList.addCustomItems.useMutation({
    onMutate: async ({ items: added }) => {
      await utils.shoppingList.getForWeek.cancel({ weekOffset });
      const previous = utils.shoppingList.getForWeek.getData({ weekOffset });
      const nonce = String(Date.now());
      utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
        old
          ? {
              ...old,
              items: [
                ...old.items,
                ...added.map((input, index) => ({
                  key: `${PENDING_KEY_PREFIX}${nonce}-${index}`,
                  ingredientName: input.name.charAt(0).toUpperCase() + input.name.slice(1),
                  quantity: String(input.quantity ?? 1),
                  unit: input.unit ?? 'pcs',
                  category: 'other' as const,
                  recipeNames: [],
                  imageUrl: '',
                  estimatedPriceEur: null,
                  isCustom: true,
                })),
              ],
            }
          : old,
      );
      setNewItemText('');
      return { previous };
    },
    onSuccess: () => capture('shopping_list_item_added', { via: 'manual' }),
    onError: (_err, vars, context) => {
      if (context?.previous) {
        utils.shoppingList.getForWeek.setData({ weekOffset }, context.previous);
      }
      setNewItemText(vars.items.map((i) => i.name).join(', '));
    },
    onSettled: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
  });
  // UX-SHOP-02: "Removed · Undo" — Undo re-adds through its own mutation (not
  // `addItemMutation`, whose success clears the add-item field).
  const undoRemoveMutation = trpc.shoppingList.addCustomItems.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.shoppingList.getForWeek.invalidate({ weekOffset }),
    onError: (err) =>
      showAppToast({ message: `Couldn't put it back. ${userFacingErrorMessage(err)}` }),
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
          showAppToast({
            message: `Removed ${item.ingredientName}`,
            type: 'success',
            action: {
              label: 'Undo',
              onClick: () =>
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
            },
          }),
      },
    );
  };

  const handleAddItem = () => {
    const parsed = parseCustomItemInput(newItemText);
    if (!parsed.name || !weekList?.planId) return;
    addItemMutation.mutate({ planId: weekList.planId, items: [parsed] });
  };

  // One-time migration of pre-P1-5 localStorage checks: keys that match the
  // current plan's items are pushed to the server, then the local copy is
  // cleared so it never overrides another device again.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !weekList?.planId || legacyChecked.length === 0) return;
    const matching = legacyChecked.filter((key) => items.some((i) => i.key === key));
    migratedRef.current = true;
    if (matching.length > 0 && weekList.checkedKeys.length === 0) {
      toggleMutation.mutate({ planId: weekList.planId, keys: matching, checked: true });
    }
    clearLegacyChecked();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the list first loads
  }, [weekList?.planId]);

  // A failed load is not an empty list (audit F-X-3-1).
  if (listError && !weekList) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-6">
        <ErrorState
          title="Couldn't load your shopping list"
          onRetry={() => void refetchList()}
          retrying={listRefetching}
        />
      </div>
    );
  }

  if (listLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-neutral-200" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      {/* Print styles */}
      {}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      {/* Print-only header */}
      <div className="shopping-list-print-header">
        Chefer Shopping List — Week of {formatDate(weekStart, 'full')}
      </div>

      {/* Page header */}
      <div className="mb-4" data-print-hide>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          THIS WEEK
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Shop</h1>

          {/* Print and Share live in an overflow menu — printing from a phone
              is a rare intent, and three buttons do not fit a phone header. */}
          <div className="flex items-center gap-2">
            <div ref={listMenu.rootRef} className="relative shrink-0">
              <button
                {...listMenu.triggerProps}
                aria-label="More list actions"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50 sm:h-9 sm:w-9"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
              {listMenu.open && (
                <div
                  {...listMenu.menuProps}
                  className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    data-testid="shop-menu-share"
                    disabled={totalItems === 0}
                    onClick={() => {
                      listMenu.setOpen(false);
                      setShareOpen(true);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
                  >
                    <Share2 className="h-4 w-4 text-neutral-500" aria-hidden="true" /> Share
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      listMenu.setOpen(false);
                      window.print();
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Printer className="h-4 w-4 text-neutral-500" /> Print
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled
                    title="Coming soon"
                    className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-500"
                  >
                    <Smartphone className="h-4 w-4" /> Send to Mobile
                    <span className="ml-auto text-xs uppercase">Soon</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* FB7-10: where the list comes from and which days it covers (a plan
            made mid-week lists only the remaining days, audit F-PM-3). */}
        <p data-testid="shop-provenance" className="mt-1 text-xs text-neutral-500">
          {shoppingProvenanceText(weekList?.fromDayOfWeek)}
        </p>
      </div>

      {/* Week Navigator */}
      <div className="mb-4" data-print-hide>
        <WeekNavigator
          weekOffset={weekOffset}
          onOffsetChange={handleWeekChange}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      </div>

      {/* Progress bar + estimated total */}
      <div className="mb-5 flex flex-wrap items-center gap-4" data-print-hide>
        {totalItems > 0 && (
          <div className="flex flex-1 items-center gap-3">
            <div
              className="max-w-xs flex-1 overflow-hidden rounded-full bg-neutral-100"
              style={{ height: '8px' }}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-neutral-500">
              {checkedCount}/{totalItems} checked
            </span>
          </div>
        )}

        {/* Estimated week total from the ingredient price vocabulary.
            T-08.9: a range (formatPriceRange), not a false-precision point
            number — matches the Plan tab's week-cost badge. */}
        {weekList?.estimatedTotalEur != null && (
          <span
            title={
              isConvertedCurrency(currency)
                ? 'Baseline estimate from typical supermarket prices, converted from EUR at an approximate rate'
                : 'Baseline estimate from typical supermarket prices'
            }
            className="whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600"
          >
            Est. total{' '}
            {formatPriceRange(weekList.estimatedTotalEur, currency, deviceLocale()) ??
              `~${formatApproxPrice(weekList.estimatedTotalEur, currency)}`}
            {/* UX-PLAN-07: the total covers the same days as the list. */}
            {shoppingWindowLabel(weekList.fromDayOfWeek)
              ? ` · ${shoppingWindowLabel(weekList.fromDayOfWeek)}`
              : ''}
          </span>
        )}

        {/* PAT-2 (UX-02 §3, T-02.1/T-02.4): the table has ≥ 1 safety rule
            checked against this week's list. */}
        {weekList?.tableSafety?.hasRules && (
          <span className="whitespace-nowrap rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-medium text-[#944a00]">
            {checkedForListHeaderText(weekList.items.length)}
          </span>
        )}

        {/* Who the quantities are for (P2-3, audit F-PM-5): a premium
            household's list is scaled to the table; a free table's list is
            recipes as written (one portion) and says so. */}
        {weekList?.portions != null ? (
          <span
            title="Quantities and total are scaled to everyone at your table"
            className="whitespace-nowrap rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-medium text-[#944a00]"
          >
            For {weekList.portions} portions
            {weekList.estimatedTotalEur != null &&
              ` · ~${formatApproxPrice(
                perPortionCost(weekList.estimatedTotalEur, weekList.portions) ?? 0,
                currency,
              )} each`}
          </span>
        ) : (
          weekList?.hasPlan &&
          memberCount > 0 && (
            <Link
              href="/preferences#household"
              title="Premium scales the list to your whole table"
              className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600 sm:min-h-0"
            >
              Sized for 1 portion
            </Link>
          )
        )}

        {/* T-10.4: the free household's sized first week says so */}
        {firstScaledWeek && (
          <p data-testid="shop-first-scaled-week" className="basis-full text-xs text-neutral-600">
            Sized for your table of{' '}
            {weekList?.portions ?? weekPlan.estimatedCost?.portions ?? memberCount} — free for your
            first week
          </p>
        )}
      </div>

      {/* Empty state */}
      {!weekList?.hasPlan ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-16 text-center">
          <ShoppingCart className="mb-4 h-10 w-10 text-neutral-300" />
          <h2 className="mb-2 font-semibold text-neutral-700">No meal plan for this week</h2>
          <p className="mb-6 max-w-xs text-sm text-neutral-500">
            Generate a meal plan to get a personalised shopping list.
          </p>
          <Link
            href="/meal-plan"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Go to Meal Planner
          </Link>
        </div>
      ) : (
        <div className="relative space-y-6">
          {/* Add your own item — same overlay the AI chef's
              addToShoppingList tool writes to */}
          <div className="flex gap-2" data-print-hide>
            <input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
              placeholder={units.addItemPlaceholder}
              aria-label="Add an item to the shopping list"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 sm:text-sm"
            />
            <button
              type="button"
              onClick={handleAddItem}
              disabled={!newItemText.trim()}
              aria-label="Add item to shopping list"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 ${pressControl}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {grouped.map(({ category, label, items: catItems }) => {
            const isExpanded = expandedCategories[category] ?? true;
            const catDone = catItems.filter((i) => checkedItems.includes(i.key)).length;
            return (
              <section key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={isExpanded}
                  className={`mb-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left hover:bg-neutral-50 ${pressCard}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    {label}
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      {catItems.length} item{catItems.length !== 1 ? 's' : ''}
                      {catDone > 0 ? ` · ${catDone} done` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {catDone === catItems.length && catItems.length > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        ✓ all
                      </span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {isExpanded && (
                  <div className="space-y-2">
                    {catItems.map((item) => {
                      const isChecked = checkedItems.includes(item.key);
                      const itemImageUrl = item.imageUrl;
                      const quantityLabel = Number.isFinite(Number(item.quantity))
                        ? units.qty(Number(item.quantity), item.unit)
                        : `${item.quantity} ${item.unit}`;
                      return (
                        // Exactly two targets per row. Previously the whole card
                        // toggled while the thumbnail and name stopped propagation
                        // to open a popup, so on touch the same tap did different
                        // things depending on which pixel you hit.
                        <div
                          key={item.key}
                          // MO-01: the whole row scales while its primary
                          // (toggle) button is pressed, not the icon button.
                          className={`flex items-center gap-1 rounded-xl border ${pressTransition} motion-safe:[&:has(>button:first-child:active)]:scale-[0.98] ${isChecked ? 'border-neutral-100 bg-neutral-50 opacity-70' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                        >
                          {/* Primary target — the whole row toggles bought/not */}
                          <button
                            type="button"
                            onClick={() => toggleItem(item.key)}
                            aria-pressed={isChecked}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left sm:p-3"
                          >
                            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                              <ItemThumb src={itemImageUrl} category={item.category} sizes="48px" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p
                                className={`flex items-center gap-1.5 text-sm font-medium ${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}
                              >
                                <span className="min-w-0 truncate">{item.ingredientName}</span>
                                {/* T-01.9: this ingredient needs a certified product for the
                                    table's diet labels (e.g. certified gluten-free oats). */}
                                {item.labelCheck && item.labelCheck.length > 0 && (
                                  <LabelCaveat text={labelCaveatCompactText()} compact />
                                )}
                              </p>
                              {/* Quantity and price share a line — as separate
                              columns the name was squeezed to ~150px. */}
                              <p className="truncate text-xs text-neutral-500">
                                {quantityLabel}
                                {item.estimatedPriceEur != null && (
                                  <span className="ml-2 font-medium">
                                    ~{formatApproxPrice(item.estimatedPriceEur, currency)}
                                  </span>
                                )}
                                {item.key.startsWith(PENDING_KEY_PREFIX) && (
                                  <span className="ml-2 text-neutral-400">Saving…</span>
                                )}
                              </p>
                            </div>

                            <span
                              aria-hidden="true"
                              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${isChecked ? 'border-primary bg-primary' : 'border-neutral-300'}`}
                            >
                              {isChecked && (
                                <CheckCircle2 className="h-4 w-4 fill-white text-white" />
                              )}
                            </span>
                          </button>

                          {/* Secondary target — detail for derived items, remove for
                          user-added ones */}
                          {item.isCustom ? (
                            <button
                              type="button"
                              onClick={() =>
                                weekList?.planId && removeCustomItem(weekList.planId, item)
                              }
                              disabled={removeItemMutation.isPending}
                              aria-label={`Remove ${item.ingredientName} from the list`}
                              title="Added by you — remove"
                              className={`mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 ${pressControl}`}
                              data-print-hide
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setPopupItem({
                                  name: item.ingredientName,
                                  imageUrl: itemImageUrl,
                                  category: item.category,
                                })
                              }
                              aria-label={`Details for ${item.ingredientName}`}
                              className={`mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 ${pressControl}`}
                              data-print-hide
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {/* Chef's Tip */}
          <div className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4" data-print-hide>
            <div className="flex gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <div>
                <h3 className="mb-1 text-xs font-semibold text-amber-800">Chef&apos;s Tip</h3>
                <p className="text-xs leading-relaxed text-amber-700">
                  Buy ingredients for meal prep on Sunday to save time during the week. Check your
                  pantry for spices, oils, and condiments before shopping — they often last several
                  weeks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ShareListDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        items={items}
        checkedKeys={checkedItems}
        weekOffset={weekOffset}
        weekStart={weekStart}
        fromDayOfWeek={weekList?.fromDayOfWeek}
        portions={weekList?.portions}
        unitSystem={units.system}
      />

      {/* Item detail — bottom sheet on phones, centred dialog at sm+ */}
      <Sheet
        open={popupItem !== null}
        onClose={() => setPopupItem(null)}
        title={popupItem?.name ?? ''}
        size="sm"
      >
        <div className="flex flex-col items-center gap-4 px-5 pb-6">
          <div className="relative aspect-square w-full max-w-[220px] overflow-hidden rounded-xl">
            {popupItem && (
              <ItemThumb
                src={popupItem.imageUrl}
                category={popupItem.category}
                alt={popupItem.name}
                sizes="220px"
                iconClassName="h-16 w-16"
              />
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
