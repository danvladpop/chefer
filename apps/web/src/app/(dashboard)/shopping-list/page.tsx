'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AvailabilityBadge } from '@/features/shopping-list/components/AvailabilityBadge';
import { WeekNavigator } from '@/features/shopping-list/components/WeekNavigator';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { trpc } from '@/lib/trpc';
import type { RouterOutputs } from '@/lib/trpc';
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  MapPin,
  Printer,
  ShoppingCart,
  Smartphone,
  Store,
  Truck,
} from 'lucide-react';

type GroceryStore = RouterOutputs['shoppingList']['searchStores']['stores'][0];
type GroceryItem = GroceryStore['items'][0];

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&h=120&fit=crop&q=80';

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  RON: 'RON ',
};
function currencySymbol(code: string | undefined): string {
  return CURRENCY_SYMBOLS[code ?? ''] ?? (code ? `${code} ` : '€');
}

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
  const [mode, setMode] = useState<'in-store' | 'delivery'>('in-store');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [locationStatus, setLocationStatus] = useState<'idle' | 'granted' | 'denied' | 'loading'>(
    'idle',
  );
  const [checkedItems, setCheckedItems, clearChecked] = useLocalStorage<string[]>(
    'shopping-checked',
    [],
  );
  const [popupItem, setPopupItem] = useState<{ name: string; imageUrl: string } | null>(null);

  const weekStart = getMondayOfWeek(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Request GPS location on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { timeout: 10000 },
    );
  }, []);

  // Fetch user preferences to get delivery address fallback
  const { data: preferencesData } = trpc.preferences.get.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const savedDeliveryAddress = preferencesData?.chefProfile?.deliveryAddress ?? null;

  // Fetch shopping list for the selected week
  const { data: weekList, isLoading: listLoading } = trpc.shoppingList.getForWeek.useQuery(
    { weekOffset },
    { staleTime: 60_000 },
  );

  // Fetch store data (enabled only when we have a planId)
  const { data: storeResult, isLoading: storesLoading } = trpc.shoppingList.searchStores.useQuery(
    {
      planId: weekList?.planId ?? '',
      lat: userLat,
      lng: userLng,
      deliveryAddress:
        locationStatus === 'denied' && savedDeliveryAddress ? savedDeliveryAddress : undefined,
    },
    {
      enabled: !!weekList?.planId,
      staleTime: 5 * 60_000,
    },
  );

  // Auto-select first (cheapest) store
  useEffect(() => {
    const firstStore = storeResult?.stores[0];
    if (firstStore && !selectedStoreId) {
      setSelectedStoreId(firstStore.id);
    }
  }, [storeResult, selectedStoreId]);

  // Reset checked items when week changes
  const handleWeekChange = useCallback(
    (offset: number) => {
      setWeekOffset(offset);
      clearChecked();
      setSelectedStoreId('');
    },
    [clearChecked],
  );

  const selectedStore = storeResult?.stores.find((s) => s.id === selectedStoreId);
  const bestValueStore = storeResult?.stores[0]; // sorted by totalEur ascending

  // Group items by category
  const items = weekList?.items ?? [];
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const totalItems = items.length;
  const checkedCount = checkedItems.filter((key) => items.some((i) => i.key === key)).length;

  // Find store item for a shopping list item — exact match first, fuzzy fallback
  const getStoreItem = (ingredientName: string): GroceryItem | undefined => {
    if (!selectedStore) return undefined;
    const nameLower = ingredientName.toLowerCase();
    const firstWord = nameLower.split(' ')[0] ?? nameLower;
    const exact = selectedStore.items.find((si) => si.ingredientName.toLowerCase() === nameLower);
    if (exact) return exact;
    return selectedStore.items.find((si) => {
      const siNameLower = si.ingredientName.toLowerCase();
      const siFirstWord = siNameLower.split(' ')[0] ?? siNameLower;
      return siNameLower.includes(firstWord) || nameLower.includes(siFirstWord);
    });
  };

  const toggleItem = (key: string) => {
    setCheckedItems((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  if (listLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-neutral-200" />
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Page header */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          THIS WEEK
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Shopping List</h1>
          <div className="flex items-center gap-2">
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

      {/* Week Navigator + Location badge */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <WeekNavigator
          weekOffset={weekOffset}
          onOffsetChange={handleWeekChange}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <MapPin className="h-3.5 w-3.5" />
          {locationStatus === 'granted' && (
            <span className="text-green-600">Using your current location</span>
          )}
          {locationStatus === 'denied' && savedDeliveryAddress && (
            <span className="text-blue-600">Using saved delivery address</span>
          )}
          {locationStatus === 'denied' && !savedDeliveryAddress && (
            <span>
              Location denied.{' '}
              <Link href="/preferences" className="underline">
                Set delivery address
              </Link>
            </span>
          )}
          {locationStatus === 'loading' && <span>Detecting location…</span>}
          {locationStatus === 'idle' && <span>Enable location for nearby store results</span>}
        </div>
      </div>

      {/* Mode toggle + progress bar */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
          <button
            onClick={() => setMode('in-store')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${mode === 'in-store' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            <Store className="h-3.5 w-3.5" /> In-Store
          </button>
          <button
            onClick={() => setMode('delivery')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${mode === 'delivery' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            <Truck className="h-3.5 w-3.5" /> Delivery
          </button>
        </div>

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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          {/* LEFT: Ingredient list */}
          <div className="space-y-6">
            {grouped.map(({ category, label, items: catItems }) => (
              <section key={category}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  {label} ({catItems.length} item{catItems.length !== 1 ? 's' : ''})
                </h2>
                <div className="space-y-2">
                  {catItems.map((item) => {
                    const storeItem = getStoreItem(item.ingredientName);
                    const isChecked = checkedItems.includes(item.key);

                    const itemImageUrl = storeItem?.imageUrl ?? FALLBACK_IMAGE;
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
                              setPopupItem({ name: item.ingredientName, imageUrl: itemImageUrl });
                            }}
                            className={`cursor-pointer text-sm font-medium underline-offset-2 hover:underline ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
                          >
                            {item.ingredientName}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {item.quantity} {item.unit}
                          </p>
                          {!isChecked &&
                            (mode === 'in-store'
                              ? storeItem?.aisleHint
                              : storeItem?.deliveryNote) && (
                              <p className="truncate text-xs text-neutral-400">
                                {mode === 'in-store'
                                  ? storeItem?.aisleHint
                                  : storeItem?.deliveryNote}
                              </p>
                            )}
                        </div>

                        {/* Price + availability */}
                        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                          {storeItem ? (
                            <span className="text-sm font-semibold text-neutral-700">
                              {currencySymbol(storeResult?.currencyCode)}
                              {storeItem.priceEur.toFixed(2)}
                            </span>
                          ) : storesLoading ? (
                            <span className="text-sm text-neutral-300">—</span>
                          ) : null}

                          {isChecked ? (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                              ✓ BOUGHT
                            </span>
                          ) : storeItem ? (
                            <AvailabilityBadge status={storeItem.availabilityStatus} />
                          ) : null}
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
          </div>

          {/* RIGHT: Store panel */}
          <div className="space-y-4">
            {/* Store selector */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Compare Stores
              </h2>

              {storesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
                  ))}
                  <p className="text-center text-xs text-neutral-400">Finding nearby stores…</p>
                </div>
              ) : !storeResult?.stores.length ? (
                <p className="text-sm text-neutral-500">No stores found.</p>
              ) : (
                <div className="space-y-2">
                  {storeResult.stores.map((store) => {
                    const isBestValue = store.id === bestValueStore?.id;
                    const isSelected = store.id === selectedStoreId;
                    return (
                      <button
                        key={store.id}
                        onClick={() => setSelectedStoreId(store.id)}
                        className={`w-full rounded-xl border-2 p-3 text-left transition ${isSelected ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-neutral-300'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-neutral-800">
                                {store.name}
                              </span>
                              {isBestValue && (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                  ★ Best Value
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500">{store.distanceKm} km away</p>
                            {store.unavailableItemCount > 0 && (
                              <p className="text-xs text-red-500">
                                {store.unavailableItemCount} items not available
                              </p>
                            )}
                          </div>
                          <span className="text-lg font-bold text-neutral-800">
                            {currencySymbol(storeResult?.currencyCode)}
                            {store.totalEur.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order summary */}
            {selectedStore && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  Order Summary
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <span>Subtotal ({selectedStore.availableItemCount} items)</span>
                    <span>
                      {currencySymbol(storeResult?.currencyCode)}
                      {selectedStore.subtotalEur.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>Est. Taxes</span>
                    <span>
                      {currencySymbol(storeResult?.currencyCode)}
                      {selectedStore.taxEur.toFixed(2)}
                    </span>
                  </div>
                  {mode === 'delivery' && (
                    <div className="flex justify-between text-neutral-600">
                      <span>Delivery Fee</span>
                      <span>
                        {selectedStore.deliveryFeeEur === 0
                          ? 'Free'
                          : `${currencySymbol(storeResult?.currencyCode)}${selectedStore.deliveryFeeEur.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-neutral-100 pt-2 font-semibold text-neutral-800">
                    <span>Total Estimated</span>
                    <span className="text-primary">
                      {currencySymbol(storeResult?.currencyCode)}
                      {(
                        selectedStore.subtotalEur +
                        selectedStore.taxEur +
                        (mode === 'delivery' ? selectedStore.deliveryFeeEur : 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                {mode === 'delivery' && (
                  <button
                    disabled
                    title="Coming soon — delivery ordering integration"
                    className="mt-4 w-full cursor-not-allowed rounded-xl bg-primary/50 py-2.5 text-sm font-medium text-white"
                  >
                    <Truck className="mr-1.5 inline h-4 w-4" />
                    Order via Delivery
                  </button>
                )}
              </div>
            )}

            {/* Chef's Tip */}
            <div className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-4">
              <div className="flex gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-amber-800">Chef's Tip</h3>
                  <p className="text-xs leading-relaxed text-amber-700">
                    Buy ingredients for meal prep on Sunday to save time during the week. Check your
                    pantry for spices, oils, and condiments before shopping — they often last
                    several weeks.
                  </p>
                </div>
              </div>
            </div>

            {/* Location prompt if no location and no saved address */}
            {locationStatus === 'denied' && !savedDeliveryAddress && (
              <div className="flex gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" />
                <div className="text-xs text-neutral-500">
                  <p className="mb-1 font-medium">Location access denied</p>
                  <p>
                    <Link href="/preferences" className="text-primary underline">
                      Set your delivery address
                    </Link>{' '}
                    in Preferences for accurate local store results.
                  </p>
                </div>
              </div>
            )}
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
