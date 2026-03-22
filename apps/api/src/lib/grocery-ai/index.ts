import { ClaudeGroceryAIService } from './claude.js';
import { MockGroceryAIService } from './mock.js';
import type { IGroceryAIService } from './types.js';

export const groceryAIService: IGroceryAIService =
  process.env['GROCERY_AI_MOCK_ENABLED'] === 'false'
    ? new ClaudeGroceryAIService()
    : new MockGroceryAIService();

export type {
  IGroceryAIService,
  GrocerySearchInput,
  GrocerySearchResult,
  GroceryStore,
  GroceryItem,
  AvailabilityStatus,
  GroceryCategory,
} from './types.js';
