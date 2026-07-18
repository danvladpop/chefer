export type AvailabilityStatus = 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';

export type GroceryCategory = 'produce' | 'proteins' | 'dairy' | 'grains' | 'frozen' | 'other';

export interface GroceryItem {
  ingredientName: string;
  quantity: string;
  unit: string;
  category: GroceryCategory;
  imageUrl: string;
  storeSku?: string;
  storeProductName?: string;
  priceEur: number;
  availabilityStatus: AvailabilityStatus;
  aisleHint?: string;
  deliveryNote?: string;
  /** true = fixture/estimated price; false = live price scraped from store website */
  isEstimated: boolean;
  /** The real product name found on the store website (only set when isEstimated = false) */
  liveProductName?: string;
}

export interface GroceryStore {
  id: string;
  name: string;
  logoUrl: string;
  address: string;
  distanceKm: number;
  inStoreAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFeeEur: number;
  minimumOrderEur: number;
  estimatedDeliveryTime: string;
  /**
   * Base URL for product search on the store's website.
   * Append encodeURIComponent(productName) to form a full search URL.
   * Example: "https://www.lidl.de/search?q=" + encodeURIComponent("LIDL Avocado Ready to Eat")
   */
  websiteSearchUrl: string;
  items: GroceryItem[];
  subtotalEur: number;
  taxEur: number;
  totalEur: number;
  availableItemCount: number;
  unavailableItemCount: number;
  /** Number of items with live (scraped) prices. 0 means all prices are estimated. */
  liveItemCount: number;
}

export interface GrocerySearchInput {
  ingredients: {
    name: string;
    quantity: string;
    unit: string;
    category: GroceryCategory;
  }[];
  userLat?: number;
  userLng?: number;
  deliveryAddress?: string;
  preferredCurrency: string;
}

export interface GrocerySearchResult {
  stores: GroceryStore[];
  searchedAt: Date;
  locationUsed: 'gps' | 'address' | 'default';
  currencyCode: string;
}

export interface IGroceryAIService {
  searchNearbyStores(input: GrocerySearchInput): Promise<GrocerySearchResult>;
}
