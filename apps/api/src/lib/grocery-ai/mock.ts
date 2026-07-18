import { fetchCarrefourPriceCachedOnly } from '../carrefour/scraper.js';
import { computeStoreTotals, GROCERY_STORES_FIXTURE } from './fixtures/grocery-stores.fixture.js';
import type {
  GroceryItem,
  GrocerySearchInput,
  GrocerySearchResult,
  IGroceryAIService,
} from './types.js';

// ─── Currency helpers ─────────────────────────────────────────────────────────

// Exchange rates relative to EUR (base currency)
const EUR_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  RON: 5.1,
};

const RON_TO_EUR = 1 / EUR_RATES.RON;

function toPreferred(eurAmount: number, rate: number): number {
  return Math.round(eurAmount * rate * 100) / 100;
}

// ─── Carrefour store id ───────────────────────────────────────────────────────

const CARREFOUR_ID = 'carrefour-city';

// ─── Service ──────────────────────────────────────────────────────────────────

export class MockGroceryAIService implements IGroceryAIService {
  async searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult> {
    const locationUsed =
      input.userLat != null ? 'gps' : input.deliveryAddress ? 'address' : 'default';

    const rate = EUR_RATES[input.preferredCurrency] ?? 1.0;

    // Map fixture items to the ingredient names from the shopping list
    const ingredientNames = new Set(input.ingredients.map((i) => i.name.toLowerCase()));

    const storePromises = GROCERY_STORES_FIXTURE.map(async (store) => {
      // Filter items to only those matching the current shopping list
      const matchedItems = store.items.filter(
        (item) =>
          ingredientNames.has(item.ingredientName.toLowerCase()) ||
          [...ingredientNames].some(
            (name) =>
              item.ingredientName.toLowerCase().includes(name) ||
              name.includes(item.ingredientName.toLowerCase().split(' ')[0] ?? ''),
          ),
      );

      // If no matches, return all fixture items (for demo purposes)
      const baseItems = matchedItems.length > 0 ? matchedItems : store.items;

      // ── Enrich Carrefour items with live prices ──────────────────────────
      let enrichedItems: GroceryItem[];
      let liveItemCount = 0;

      if (store.id === CARREFOUR_ID) {
        enrichedItems = await Promise.all(
          baseItems.map(async (item) => {
            const live = await fetchCarrefourPriceCachedOnly(item.ingredientName);
            if (live) {
              liveItemCount++;
              return {
                ...item,
                // Convert RON → EUR so existing currency conversion works correctly
                priceEur: live.priceRon * RON_TO_EUR,
                isEstimated: false,
                liveProductName: live.productName,
              };
            }
            // No live price found — keep fixture price, mark as estimated
            return { ...item, isEstimated: true };
          }),
        );
      } else {
        // LIDL / Kaufland — all estimated
        enrichedItems = baseItems.map((item) => ({ ...item, isEstimated: true }));
      }

      // Convert prices to preferred currency
      const convertedItems = enrichedItems.map((item) => ({
        ...item,
        priceEur: toPreferred(item.priceEur, rate),
      }));

      const subtotal = convertedItems.reduce((sum, item) => sum + item.priceEur, 0);
      const tax = toPreferred(subtotal * 0.08, 1);
      const deliveryFee = toPreferred(store.deliveryFeeEur, rate);
      const total = toPreferred(subtotal + tax + deliveryFee, 1);
      const totals = computeStoreTotals(
        convertedItems.map((i) => ({ ...i, priceEur: i.priceEur })),
        deliveryFee,
      );

      return {
        ...store,
        items: convertedItems,
        deliveryFeeEur: deliveryFee,
        minimumOrderEur: toPreferred(store.minimumOrderEur, rate),
        subtotalEur: Math.round(subtotal * 100) / 100,
        taxEur: tax,
        totalEur: total,
        availableItemCount: totals.availableItemCount,
        unavailableItemCount: totals.unavailableItemCount,
        liveItemCount,
      };
    });

    const stores = await Promise.all(storePromises);

    return {
      stores: stores.sort((a, b) => a.totalEur - b.totalEur),
      searchedAt: new Date(),
      locationUsed,
      currencyCode: input.preferredCurrency,
    };
  }
}
