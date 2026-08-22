'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { WeekNavigator } from '@/features/shopping-list/components/WeekNavigator';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  CheckCircle2,
  Info,
  Lightbulb,
  MoreHorizontal,
  Printer,
  RefreshCw,
  ShoppingCart,
  Smartphone,
} from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { formatQuantity } from '@chefer/utils';

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

export default function ShoppingListPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [checkedItems, setCheckedItems, clearChecked] = useLocalStorage<string[]>(
    'shopping-checked',
    [],
  );
  const [popupItem, setPopupItem] = useState<{ name: string; imageUrl: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isPremium = useIsPremium();
  const unitSystem = useUnitSystem();

  const weekStart = getMondayOfWeek(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Fetch shopping list for the selected week
  const { data: weekList, isLoading: listLoading } = trpc.shoppingList.getForWeek.useQuery(
    { weekOffset },
    { staleTime: 60_000 },
  );

  const utils = trpc.useUtils();

  // AI-regenerate mutation — updates the getForWeek cache inline on success
  const regenerateMutation = trpc.shoppingList.regenerate.useMutation({
    onSuccess: (data) => {
      capture('shopping_list_regenerated');
      utils.shoppingList.getForWeek.setData({ weekOffset }, data);
    },
  });

  // Reset checked items when week changes
  const handleWeekChange = useCallback(
    (offset: number) => {
      setWeekOffset(offset);
      clearChecked();
    },
    [clearChecked],
  );

  // Group items by category
  const items = weekList?.items ?? [];
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const totalItems = items.length;
  const checkedCount = checkedItems.filter((key) => items.some((i) => i.key === key)).length;

  const toggleItem = (key: string) => {
    setCheckedItems((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

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
        Chefer Shopping List — Week of{' '}
        {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      {/* Page header */}
      <div className="mb-4" data-print-hide>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          THIS WEEK
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Shopping List</h1>

          {/* Three ~150px buttons do not fit a phone header. Regenerate stays
              primary; Print and Send-to-Mobile move into an overflow menu —
              printing from a phone is a rare intent anyway. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* AI consolidation is premium — free users see the upgrade CTA instead */}
            {isPremium !== false ? (
              <button
                onClick={() => regenerateMutation.mutate({ weekOffset })}
                disabled={regenerateMutation.isPending || !weekList?.hasPlan}
                title={!weekList?.hasPlan ? 'Generate a meal plan first' : undefined}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50 sm:min-h-0 sm:flex-none"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 shrink-0 ${regenerateMutation.isPending ? 'animate-spin' : ''}`}
                />
                <span className="truncate">
                  {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate list'}
                </span>
              </button>
            ) : (
              <UpgradeButton
                className="min-h-11 flex-1 sm:min-h-0 sm:flex-none"
                source="shopping-list"
              />
            )}

            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More list actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50 sm:h-9 sm:w-9"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden="true"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        window.print();
                      }}
                      className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <Printer className="h-4 w-4 text-neutral-500" /> Print
                    </button>
                    <button
                      role="menuitem"
                      disabled
                      title="Coming soon"
                      className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-500"
                    >
                      <Smartphone className="h-4 w-4" /> Send to Mobile
                      <span className="ml-auto text-[10px] uppercase">Soon</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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

        {/* Estimated week total from the ingredient price vocabulary */}
        {weekList?.estimatedTotalEur != null && (
          <span
            title="Baseline estimate from typical supermarket prices"
            className="whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600"
          >
            Est. total ~€{weekList.estimatedTotalEur.toFixed(2)}
          </span>
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
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Go to Meal Planner
          </Link>
        </div>
      ) : (
        <div className="relative space-y-6">
          {/* Regenerating overlay — dims the current list while the AI consolidates */}
          {regenerateMutation.isPending && (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-white/70 pt-10 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-8 py-6 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/restaurant-food-loading.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-28 w-28"
                />
                <p className="text-sm font-medium text-neutral-600">
                  Consolidating your list with AI…
                </p>
              </div>
            </div>
          )}
          {grouped.map(({ category, label, items: catItems }) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                {label} ({catItems.length} item{catItems.length !== 1 ? 's' : ''})
              </h2>
              <div className="space-y-2">
                {catItems.map((item) => {
                  const isChecked = checkedItems.includes(item.key);
                  const itemImageUrl = item.imageUrl;
                  const quantityLabel = Number.isFinite(Number(item.quantity))
                    ? formatQuantity(Number(item.quantity), item.unit, unitSystem)
                    : `${item.quantity} ${item.unit}`;
                  return (
                    // Exactly two targets per row. Previously the whole card
                    // toggled while the thumbnail and name stopped propagation
                    // to open a popup, so on touch the same tap did different
                    // things depending on which pixel you hit.
                    <div
                      key={item.key}
                      className={`flex items-center gap-1 rounded-xl border transition ${isChecked ? 'border-neutral-100 bg-neutral-50 opacity-70' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                    >
                      {/* Primary target — the whole row toggles bought/not */}
                      <button
                        type="button"
                        onClick={() => toggleItem(item.key)}
                        aria-pressed={isChecked}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left sm:p-3"
                      >
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                          <Image
                            src={itemImageUrl}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                            onError={(e) => {
                              e.currentTarget.src = FALLBACK_IMAGE;
                            }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}
                          >
                            {item.ingredientName}
                          </p>
                          {/* Quantity and price share a line — as separate
                              columns the name was squeezed to ~150px. */}
                          <p className="truncate text-xs text-neutral-500">
                            {quantityLabel}
                            {item.estimatedPriceEur != null && (
                              <span className="ml-2 font-medium">
                                ~€{item.estimatedPriceEur.toFixed(2)}
                              </span>
                            )}
                          </p>
                        </div>

                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${isChecked ? 'border-primary bg-primary' : 'border-neutral-300'}`}
                        >
                          {isChecked && <CheckCircle2 className="h-4 w-4 fill-white text-white" />}
                        </span>
                      </button>

                      {/* Secondary target — ingredient detail */}
                      <button
                        type="button"
                        onClick={() =>
                          setPopupItem({ name: item.ingredientName, imageUrl: itemImageUrl })
                        }
                        aria-label={`Details for ${item.ingredientName}`}
                        className="mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-500"
                        data-print-hide
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

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
              <Image
                src={popupItem.imageUrl}
                alt={popupItem.name}
                fill
                sizes="220px"
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_IMAGE;
                }}
              />
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
