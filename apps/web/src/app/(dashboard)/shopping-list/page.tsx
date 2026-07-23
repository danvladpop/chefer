'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { WeekNavigator } from '@/features/shopping-list/components/WeekNavigator';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { trpc } from '@/lib/trpc';
import {
  CheckCircle2,
  Lightbulb,
  Printer,
  RefreshCw,
  ShoppingCart,
  Smartphone,
} from 'lucide-react';
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
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      {/* Print-only header */}
      <div className="shopping-list-print-header">
        Chefer Shopping List — Week of{' '}
        {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      {/* Page header */}
      <div className="mb-4" data-print-hide>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          THIS WEEK
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Shopping List</h1>
          <div className="flex items-center gap-2">
            {/* AI consolidation is premium — free users see the upgrade CTA instead */}
            {isPremium !== false ? (
              <button
                onClick={() => regenerateMutation.mutate({ weekOffset })}
                disabled={regenerateMutation.isPending || !weekList?.hasPlan}
                title={!weekList?.hasPlan ? 'Generate a meal plan first' : undefined}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${regenerateMutation.isPending ? 'animate-spin' : ''}`}
                />
                {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate shopping list'}
              </button>
            ) : (
              <UpgradeButton />
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
              title="Send to Mobile — coming soon"
            >
              <Smartphone className="h-3.5 w-3.5" /> Send to Mobile
            </button>
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {label} ({catItems.length} item{catItems.length !== 1 ? 's' : ''})
              </h2>
              <div className="space-y-2">
                {catItems.map((item) => {
                  const isChecked = checkedItems.includes(item.key);
                  const itemImageUrl = item.imageUrl;
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleItem(item.key)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${isChecked ? 'border-neutral-100 bg-neutral-50 opacity-70' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                    >
                      {/* Thumbnail — click opens detail popup */}
                      <div
                        className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopupItem({ name: item.ingredientName, imageUrl: itemImageUrl });
                        }}
                      >
                        <Image
                          src={itemImageUrl}
                          alt={item.ingredientName}
                          fill
                          sizes="48px"
                          className="object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                          }}
                        />
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <p
                          onClick={(e) => {
                            e.stopPropagation();
                            setPopupItem({ name: item.ingredientName, imageUrl: item.imageUrl });
                          }}
                          className={`cursor-pointer text-sm font-medium underline-offset-2 hover:underline ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
                        >
                          {item.ingredientName}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {Number.isFinite(Number(item.quantity))
                            ? formatQuantity(Number(item.quantity), item.unit, unitSystem)
                            : `${item.quantity} ${item.unit}`}
                        </p>
                      </div>

                      {/* Estimated price + bought badge */}
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                        {item.estimatedPriceEur != null && (
                          <span
                            title="Estimated typical supermarket price"
                            className="text-sm font-semibold text-neutral-500"
                          >
                            <span className="mr-0.5 text-xs font-normal">~</span>€
                            {item.estimatedPriceEur.toFixed(2)}
                          </span>
                        )}
                        {isChecked && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                            ✓ BOUGHT
                          </span>
                        )}
                      </div>

                      {/* Checkbox — stopPropagation so card click doesn't double-toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItem(item.key);
                        }}
                        aria-label={`${item.ingredientName}, ${item.quantity} ${item.unit}`}
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${isChecked ? 'border-primary bg-primary' : 'border-neutral-300 hover:border-primary'}`}
                      >
                        {isChecked && <CheckCircle2 className="h-4 w-4 fill-white text-white" />}
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

      {/* Item detail popup */}
      {popupItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPopupItem(null)}
        >
          <div
            className="flex w-72 flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-48 w-48 overflow-hidden rounded-xl">
              <Image
                src={popupItem.imageUrl}
                alt={popupItem.name}
                fill
                sizes="192px"
                className="object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                }}
              />
            </div>
            <p className="text-center text-base font-semibold text-neutral-800">{popupItem.name}</p>
            <button
              onClick={() => setPopupItem(null)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
