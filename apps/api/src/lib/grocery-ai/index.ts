import { env } from '../env.js';
import { ClaudeGroceryAIService } from './claude.js';
import { MockGroceryAIService } from './mock.js';
import type { IGroceryAIService } from './types.js';

// T-BUG-X6: this used to read process.env directly (the one exception to
// "env vars go through env.ts", CLAUDE.md § Environment variables).
export const groceryAIService: IGroceryAIService = env.GROCERY_AI_MOCK_ENABLED
  ? new MockGroceryAIService()
  : new ClaudeGroceryAIService();

export type {
  IGroceryAIService,
  GrocerySearchInput,
  GrocerySearchResult,
  GroceryStore,
  GroceryItem,
  AvailabilityStatus,
  GroceryCategory,
} from './types.js';
