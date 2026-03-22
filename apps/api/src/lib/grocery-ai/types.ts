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
  items: GroceryItem[];
  subtotalEur: number;
  taxEur: number;
  totalEur: number;
  availableItemCount: number;
  unavailableItemCount: number;
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
