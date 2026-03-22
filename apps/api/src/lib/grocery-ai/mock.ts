import { GROCERY_STORES_FIXTURE } from './fixtures/grocery-stores.fixture.js';
import type { GrocerySearchInput, GrocerySearchResult, IGroceryAIService } from './types.js';

export class MockGroceryAIService implements IGroceryAIService {
  async searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult> {
    const locationUsed =
      input.userLat != null ? 'gps' : input.deliveryAddress ? 'address' : 'default';

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

      const subtotalEur = items.reduce((sum, item) => sum + item.priceEur, 0);
      const taxEur = Math.round(subtotalEur * 0.08 * 100) / 100;
      const totalEur = Math.round((subtotalEur + taxEur + store.deliveryFeeEur) * 100) / 100;

      return {
        ...store,
        items,
        subtotalEur: Math.round(subtotalEur * 100) / 100,
        taxEur,
        totalEur,
        availableItemCount: items.filter((i) => i.availabilityStatus !== 'OUT_OF_STOCK').length,
        unavailableItemCount: items.filter((i) => i.availabilityStatus === 'OUT_OF_STOCK').length,
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
