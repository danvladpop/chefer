import { GROCERY_STORES_FIXTURE } from './fixtures/grocery-stores.fixture.js';
import type { GrocerySearchInput, GrocerySearchResult, IGroceryAIService } from './types.js';

// Exchange rates relative to EUR (base currency)
const EUR_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  RON: 5.1,
};

function toPreferred(eurAmount: number, rate: number): number {
  return Math.round(eurAmount * rate * 100) / 100;
}

export class MockGroceryAIService implements IGroceryAIService {
  async searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult> {
    const locationUsed =
      input.userLat != null ? 'gps' : input.deliveryAddress ? 'address' : 'default';

    const rate = EUR_RATES[input.preferredCurrency] ?? 1.0;

    // Map fixture items to the ingredient names from the shopping list
    const ingredientNames = new Set(input.ingredients.map((i) => i.name.toLowerCase()));

    const stores = GROCERY_STORES_FIXTURE.map((store) => {
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
      const items = matchedItems.length > 0 ? matchedItems : store.items;

      // Convert each item's price to the preferred currency
      const convertedItems = items.map((item) => ({
        ...item,
        priceEur: toPreferred(item.priceEur, rate),
      }));

      const subtotal = convertedItems.reduce((sum, item) => sum + item.priceEur, 0);
      const tax = toPreferred(subtotal * 0.08, 1);
      const deliveryFee = toPreferred(store.deliveryFeeEur, rate);
      const total = toPreferred(subtotal + tax + deliveryFee, 1);

      return {
        ...store,
        items: convertedItems,
        deliveryFeeEur: deliveryFee,
        minimumOrderEur: toPreferred(store.minimumOrderEur, rate),
        subtotalEur: Math.round(subtotal * 100) / 100,
        taxEur: tax,
        totalEur: total,
        availableItemCount: convertedItems.filter((i) => i.availabilityStatus !== 'OUT_OF_STOCK')
          .length,
        unavailableItemCount: convertedItems.filter((i) => i.availabilityStatus === 'OUT_OF_STOCK')
          .length,
      };
    });

    return {
      stores: stores.sort((a, b) => a.totalEur - b.totalEur),
      searchedAt: new Date(),
      locationUsed,
      currencyCode: input.preferredCurrency,
    };
  }
}
